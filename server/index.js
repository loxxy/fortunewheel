require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { CronExpressionParser } = require('cron-parser');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 4000;
const DRAW_CRON = process.env.DRAW_CRON || '0 0 13 * * FRI'; // 1 PM every Friday
const DRAW_TIMEZONE =
  process.env.DRAW_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
const WINNER_HISTORY_LIMIT = parseInt(process.env.WINNER_HISTORY_LIMIT || '40', 10);
const REPEAT_COOLDOWN = parseInt(process.env.REPEAT_COOLDOWN || '3', 10);

const EMPLOYEE_CSV_PATH = path.join(__dirname, 'data', 'employees.csv');
const WINNERS_PATH = path.join(__dirname, 'data', 'winners.csv');

const app = express();
app.use(cors());
app.use(express.json());

function loadEmployees() {
  try {
    if (!fs.existsSync(EMPLOYEE_CSV_PATH)) {
      console.warn('Employee CSV missing:', EMPLOYEE_CSV_PATH);
      return [];
    }
    const csvRaw = fs.readFileSync(EMPLOYEE_CSV_PATH, 'utf8');
    const rows = parse(csvRaw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return rows
      .filter((row) => row.firstName)
      .map((row, index) => ({
        id: row.id || `emp-${index + 1}`,
        firstName: row.firstName,
        lastName: row.lastName || '',
        role: row.role || '',
        avatar: row.avatar || '',
      }));
  } catch (error) {
    console.error('Failed to parse employees CSV', error);
    return [];
  }
}

function loadWinners() {
  try {
    if (!fs.existsSync(WINNERS_PATH)) {
      return [];
    }

    const csvRaw = fs.readFileSync(WINNERS_PATH, 'utf8');
    const rows = parse(csvRaw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      drawnAt: row.drawnAt,
      trigger: row.trigger || 'scheduled',
    }));
  } catch (error) {
    console.error('Failed to load winners file', error);
    return [];
  }
}

let employeesCache = loadEmployees();
let winnersCache = loadWinners();

function persistWinners() {
  const csv = stringify(winnersCache, {
    header: true,
    columns: ['id', 'employeeId', 'drawnAt', 'trigger'],
  });
  fs.writeFileSync(WINNERS_PATH, csv);
}

function getRandomEmployee() {
  if (!employeesCache.length) {
    throw new Error('No employees to pick from');
  }

  const recentWinnerIds = new Set(
    winnersCache.slice(-REPEAT_COOLDOWN).map((winner) => winner.employeeId)
  );

  const eligible =
    employeesCache.length > recentWinnerIds.size
      ? employeesCache.filter((employee) => !recentWinnerIds.has(employee.id))
      : employeesCache;

  return eligible[Math.floor(Math.random() * eligible.length)];
}

function drawWinner(trigger = 'manual') {
  const employee = getRandomEmployee();
  const entry = {
    id: randomUUID(),
    employeeId: employee.id,
    drawnAt: new Date().toISOString(),
    trigger,
  };
  winnersCache.push(entry);

  if (WINNER_HISTORY_LIMIT > 0 && winnersCache.length > WINNER_HISTORY_LIMIT) {
    winnersCache = winnersCache.slice(-WINNER_HISTORY_LIMIT);
  }

  persistWinners();
  return { entry, employee };
}

function mapWinner(entry) {
  const employee = employeesCache.find((emp) => emp.id === entry.employeeId);
  return {
    ...entry,
    employee: employee || null,
  };
}

function getNextDrawDate(fromDate = new Date()) {
  try {
    const interval = CronExpressionParser.parse(DRAW_CRON, {
      currentDate: fromDate,
      tz: DRAW_TIMEZONE,
    });
    return interval.next().toDate();
  } catch (error) {
    console.error('Unable to get next draw date', error);
    return null;
  }
}

if (fs.existsSync(EMPLOYEE_CSV_PATH)) {
  fs.watchFile(
    EMPLOYEE_CSV_PATH,
    { interval: 2000 },
    () => {
      employeesCache = loadEmployees();
      console.log('Employee roster reloaded. Total employees:', employeesCache.length);
    }
  );
}

app.get('/api/employees', (_req, res) => {
  res.json({ employees: employeesCache });
});

app.get('/api/winners', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const winners = winnersCache.slice(-limit).reverse().map(mapWinner);
  res.json({ winners });
});

app.post('/api/spin', (_req, res) => {
  try {
    const result = drawWinner('manual');
    res.json({
      winner: {
        ...result.entry,
        employee: result.employee,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/config', (_req, res) => {
  res.json({
    cron: DRAW_CRON,
    timezone: DRAW_TIMEZONE,
    nextDrawAt: getNextDrawDate(),
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Fortune wheel server listening on port ${PORT}`);
  });
}

cron.schedule(
  DRAW_CRON,
  () => {
    try {
      const { employee } = drawWinner('scheduled');
      console.log(`Scheduled draw winner: ${employee.firstName} ${employee.lastName}`);
    } catch (error) {
      console.error('Failed to run scheduled draw', error);
    }
  },
  {
    timezone: DRAW_TIMEZONE,
  }
);

module.exports = app;
