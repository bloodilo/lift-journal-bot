/** @OnlyCurrentDoc */
// Журнал лифтов. Скрипт привязан к таблице (Расширения → Apps Script).
// Принимает POST от бота на .210 и раскладывает по листам «Простои», «Сообщения», «Сводка».
// Простой ведётся отдельно на каждый лифт: грузовой (большой) и малый.
// Колонки правее бота («№ заявки в аварийке», «Примечание») ручные, скрипт их не трогает.

const TOKEN = 'CHANGE_ME'; // тот же токен, что GSHEET_TOKEN в config.py
const TZ = 'Europe/Moscow';
const INC_HEAD = ['№', 'Лифт', 'Начало', 'Конец', 'Часов', 'Жалоб', 'Статус', 'Дольше 24 ч', 'Оба стояли',
                  'Первое сообщение', 'Ссылка', '№ заявки в аварийке', 'Примечание'];
const INC_W = 11;
const MSG_HEAD = ['ID', 'Дата', 'Автор', 'Тип', 'Лифт', 'Текст', 'Фото', 'Ссылка', 'Простой №'];
const STATUS = {open: 'не работает', closed: 'починен', unknown_end: ''};
const KIND = {broken: 'сломан', fixed: 'починен', info: 'по теме'};
const LIFTS = ['грузовой', 'малый', 'не указан'];

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  if (p.token !== TOKEN) return out_({ok: false, err: 'token'});
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inc = sheet_(ss, 'Простои', INC_HEAD, [3, 4], p.reset);
    const msg = sheet_(ss, 'Сообщения', MSG_HEAD, [2], p.reset);
    upsert_(inc, (p.incidents || []).map(incRow_), INC_W);
    upsert_(msg, (p.messages || []).map(msgRow_), MSG_HEAD.length);
    summary_(ss, inc);
    return out_({ok: true, incidents: (p.incidents || []).length, messages: (p.messages || []).length});
  } catch (err) {
    return out_({ok: false, err: String(err)});
  } finally {
    lock.releaseLock();
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// reset = стереть лист целиком (вместе с ручными колонками) и завести заново
function sheet_(ss, name, head, dateCols, reset) {
  let sh = ss.getSheetByName(name);
  if (sh && !reset) return sh;
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  ss.setSpreadsheetTimeZone(TZ);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  dateCols.forEach(c => sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('dd.MM.yyyy HH:mm'));
  return sh;
}

function hours_(r) {
  return r.end ? Math.round((r.end - r.start) / 360000) / 10 : '';
}

function incRow_(r) {
  const h = hours_(r);
  return [r.id, r.lift, new Date(r.start), r.end ? new Date(r.end) : '', h, r.reports,
          r.status in STATUS ? STATUS[r.status] : r.status, h === '' ? '' : (h > 24 ? 'да' : 'нет'), r.both ? 'да' : '',
          r.text, r.link];
}

function msgRow_(r) {
  return [r.id, new Date(r.ts), r.author, KIND[r.kind] || r.kind, r.lift, r.text,
          r.media ? 'да' : '', r.link, r.incident || ''];
}

// Обновляет строки по ID в колонке A, новые дописывает в конец. Пишет только первые width колонок.
function upsert_(sh, rows, width) {
  if (!rows.length) return;
  const last = sh.getLastRow();
  const pos = {};
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach((v, i) => { pos[String(v[0])] = i + 2; });
  }
  const add = [];
  rows.forEach(r => {
    const row = pos[String(r[0])];
    if (row) sh.getRange(row, 1, 1, width).setValues([r]);
    else add.push(r);
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, width).setValues(add);
}

const r1_ = x => Math.round(x * 10) / 10;

// Сводка пересчитывается целиком при каждой выгрузке: итог по каждому лифту и разбивка по месяцам.
function summary_(ss, inc) {
  let sh = ss.getSheetByName('Сводка');
  if (!sh) sh = ss.insertSheet('Сводка', 0);
  const last = inc.getLastRow();
  const data = last > 1 ? inc.getRange(2, 1, last - 1, INC_W).getValues().filter(r => r[2] instanceof Date) : [];
  const fmt = d => Utilities.formatDate(d, TZ, 'dd.MM.yyyy');

  // итог по лифтам
  const tot = {};
  LIFTS.concat(['всего']).forEach(l => { tot[l] = {n: 0, h: 0, long: 0, unk: 0, max: 0, last: null, open: false}; });
  const by = {};
  data.forEach(r => {
    const lift = LIFTS.indexOf(r[1]) >= 0 ? r[1] : 'не указан';
    const known = typeof r[4] === 'number';
    [tot[lift], tot['всего']].forEach(t => {
      t.n++;
      if (known) { t.h += r[4]; if (r[4] > 24) t.long++; if (r[4] > t.max) t.max = r[4]; } else t.unk++;
      if (!t.last || r[2] > t.last) t.last = r[2];
      if (r[6] === STATUS.open) t.open = true;
    });
    const m = Utilities.formatDate(r[2], TZ, 'yyyy-MM');
    const s = by[m] || (by[m] = {'грузовой': [0, 0], 'малый': [0, 0], 'не указан': [0, 0], both: 0, long: 0});
    s[lift][0]++;
    if (known) { s[lift][1] += r[4]; if (r[4] > 24) s.long++; }
    if (r[8] === 'да' && lift !== 'малый') s.both++;
  });

  const head1 = ['Лифт', 'Простоев', 'Часов простоя', 'Дольше 24 ч', 'Самый длинный, ч',
                 'Последний простой', 'Сейчас'];
  const rows1 = LIFTS.concat(['всего']).map(l => {
    const t = tot[l];
    return [l, t.n, r1_(t.h), t.long, t.max || '', t.last ? fmt(t.last) : '', t.open ? 'НЕ РАБОТАЕТ' : ''];
  });
  const head2 = ['Месяц', 'Грузовой: простоев', 'Грузовой: часов', 'Малый: простоев', 'Малый: часов',
                 'Лифт не указан: простоев', 'Оба стояли сразу', 'Дольше 24 ч'];
  const rows2 = Object.keys(by).sort().map(m => {
    const s = by[m];
    return [m, s['грузовой'][0], r1_(s['грузовой'][1]), s['малый'][0], r1_(s['малый'][1]),
            s['не указан'][0], s.both, s.long];
  });

  sh.clear();
  sh.getRange(1, 1, 1, head1.length).setValues([head1]).setFontWeight('bold');
  sh.getRange(2, 1, rows1.length, head1.length).setValues(rows1);
  const top = rows1.length + 3;
  sh.getRange(top, 1, 1, 8).setValues([head2]).setFontWeight('bold');
  if (rows2.length) {
    // месяц текстом, иначе таблица превратит «2026-09» в дату
    sh.getRange(top + 1, 1, rows2.length, 1).setNumberFormat('@');
    sh.getRange(top + 1, 1, rows2.length, 8).setValues(rows2);
  }
  sh.getRange(1, 1, top, 8).setWrap(true);
  sh.setColumnWidths(1, 8, 130);
}
