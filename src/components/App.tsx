import React, { useEffect, useState } from 'react';

type Status =
  | 'PENDENTE'
  | 'NAO_ATENDEU'
  | 'OUTRA_CIDADE'
  | 'NAO_PODE_FAZER_PESQUISA'
  | 'PESQUISA_FEITA'
  | 'CAIXA_POSTAL'
  | 'RETORNO'
  | 'NUMERO_NAO_EXISTE'
  | 'REMOVER_DA_LISTA'
  | 'RECUSA';

type PartePayload = {
  csv?: string;
  chave_parte?: string;
};

type Row = {
  id: string;
  LINE: number;
  IDP: string;
  ESTADO: string;
  CIDADE: string;
  REGIAO_CIDADE: string;
  TF1: string;
  TF2: string;
  STATUS: Status;
  OBSERVACAO: string;
  DT_ALTERACAO: string;
};

type DirtyRow = {
  STATUS: Status;
  OBSERVACAO: string;
  DT_ALTERACAO: string;
  UPDATED_AT_MS: number;
};

type StatusFilter = 'TODOS' | 'PENDENTES' | Status;

type SimpleResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

const PAGE_SIZE = 15;

const API_GET_ENTREGA = 'https://n8n.srv962474.hstgr.cloud/webhook/entregas';
const API_SAVE_PARTE = 'https://n8n.srv962474.hstgr.cloud/webhook/parte/salvar';

const COLORS = {
  bg: '#f3f4f6',
  card: '#ffffff',
  card2: '#fafafa',
  text: '#111111',
  muted: '#666666',
  border: '#d1d5db',
  primary: '#000000',
  primaryText: '#ffffff',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#2563eb',
  orange: '#ea580c',
  purple: '#7c3aed',
  teal: '#0f766e',
};

const globalCss = `
html, body, #root {
  height: 100%;
}
body {
  margin: 0;
  padding: 0;
  background: ${COLORS.bg};
  color: ${COLORS.text};
  font-family: Arial, Helvetica, sans-serif;
}
* {
  box-sizing: border-box;
}
button, input, select, textarea {
  font-family: inherit;
}
button {
  -webkit-tap-highlight-color: transparent;
}
input, select, textarea {
  font-size: 16px;
}
`;

function zeroPad(value: number | string, size: number) {
  var text = String(value == null ? '' : value);
  if ((text as any).padStart) return (text as any).padStart(size, '0');
  return ('000000000000' + text).slice(-size);
}

function nowLocalStampSemMs() {
  var d = new Date();
  return (
    zeroPad(d.getDate(), 2) +
    '/' +
    zeroPad(d.getMonth() + 1, 2) +
    '/' +
    d.getFullYear() +
    ' ' +
    zeroPad(d.getHours(), 2) +
    ':' +
    zeroPad(d.getMinutes(), 2) +
    ':' +
    zeroPad(d.getSeconds(), 2)
  );
}

function safeNormalizeText(value: string) {
  var text = String(value || '').replace(/^\uFEFF/, '');
  try {
    if ((text as any).normalize) {
      return (text as any).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
  } catch (e) {}
  return text;
}

function parseSimpleQueryString(qs: string) {
  var out: Record<string, string> = {};
  var clean = String(qs || '').replace(/^\?/, '').trim();
  if (!clean) return out;

  var parts = clean.split('&');
  for (var i = 0; i < parts.length; i++) {
    var piece = parts[i];
    if (!piece) continue;

    var eq = piece.indexOf('=');
    var key = piece;
    var val = '';

    if (eq >= 0) {
      key = piece.slice(0, eq);
      val = piece.slice(eq + 1);
    }

    try {
      key = decodeURIComponent(String(key || '').replace(/\+/g, ' '));
    } catch (e) {}
    try {
      val = decodeURIComponent(String(val || '').replace(/\+/g, ' '));
    } catch (e) {}

    out[key] = val;
  }

  return out;
}

function getEntregaIdOnly(): string {
  try {
    var hash = window.location.hash || '';
    var qi = hash.indexOf('?');

    if (qi >= 0) {
      var hashQs = hash.slice(qi + 1);

      try {
        if (typeof URLSearchParams !== 'undefined') {
          var hp = new URLSearchParams(hashQs);
          var v = String(hp.get('entregaId') || '').trim();
          if (v && v !== 'undefined' && v !== 'null') return v;
        }
      } catch (e) {}

      var parsedHash = parseSimpleQueryString(hashQs);
      var vHash = String(parsedHash.entregaId || '').trim();
      if (vHash && vHash !== 'undefined' && vHash !== 'null') return vHash;
    }

    var searchQs = window.location.search || '';

    try {
      if (typeof URLSearchParams !== 'undefined') {
        var sp = new URLSearchParams(searchQs);
        var v2 = String(sp.get('entregaId') || '').trim();
        if (v2 && v2 !== 'undefined' && v2 !== 'null') return v2;
      }
    } catch (e) {}

    var parsedSearch = parseSimpleQueryString(searchQs);
    var vSearch = String(parsedSearch.entregaId || '').trim();
    if (vSearch && vSearch !== 'undefined' && vSearch !== 'null') return vSearch;
  } catch (e) {}

  return '';
}

function safeTel(v: string) {
  return String(v || '')
    .trim()
    .replace(/[^\d+]/g, '');
}

function telToDial(v: string) {
  var digits = safeTel(v).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.indexOf('0') === 0 || digits.indexOf('55') === 0) return digits;
  return '0' + digits;
}

function supportsFetch() {
  try {
    return typeof fetch !== 'undefined';
  } catch (e) {
    return false;
  }
}

function xhrRequest(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<SimpleResponse>(function (resolve, reject) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open(options && options.method ? options.method : 'GET', url, true);

      var headers = (options && options.headers) || {};
      var keys = Object.keys(headers);
      for (var i = 0; i < keys.length; i++) {
        xhr.setRequestHeader(keys[i], headers[keys[i]]);
      }

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;

        var responseText = xhr.responseText || '';
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          text: function () {
            return Promise.resolve(responseText);
          },
        });
      };

      xhr.onerror = function () {
        reject(new Error('Falha de rede'));
      };

      xhr.send(options && options.body ? options.body : null);
    } catch (e) {
      reject(e);
    }
  });
}

function requestText(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) {
  if (supportsFetch()) {
    return fetch(url, {
      method: options && options.method ? options.method : 'GET',
      headers: options && options.headers ? options.headers : undefined,
      body: options && options.body ? options.body : undefined,
      cache: 'no-store',
    }).then(function (resp) {
      return {
        ok: resp.ok,
        status: resp.status,
        text: function () {
          return resp.text();
        },
      } as SimpleResponse;
    });
  }

  return xhrRequest(url, options);
}

function normalizeHeader(h: string) {
  return safeNormalizeText(h).trim().toUpperCase();
}

function canonicalHeaderKey(h: string) {
  var n = normalizeHeader(h)
    .replace(/[.\-\/\\]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  var semSufixo = n.replace(/_\d+$/, '');

  if (semSufixo === 'STATUS') return 'STATUS';
  if (semSufixo === 'OBSERVACAO') return 'OBSERVACAO';

  var dtCompacto = semSufixo.replace(/_/g, '');
  if (dtCompacto === 'DTALTERACAO') return 'DT_ALTERACAO';

  if (semSufixo === 'LINE') return 'LINE';
  if (semSufixo === 'IDP') return 'IDP';
  if (semSufixo === 'ESTADO' || semSufixo === 'UF') return 'ESTADO';
  if (semSufixo === 'CIDADE') return 'CIDADE';
  if (semSufixo === 'REGIAOCIDADE' || semSufixo === 'REGIAO_CIDADE' || semSufixo === 'REGIAO') return 'REGIAO_CIDADE';
  if (semSufixo === 'TF1' || semSufixo === 'TEL1' || semSufixo === 'TELEFONE1' || semSufixo === 'TELEFONE_1') return 'TF1';
  if (semSufixo === 'TF2' || semSufixo === 'TEL2' || semSufixo === 'TELEFONE2' || semSufixo === 'TELEFONE_2') return 'TF2';

  return semSufixo;
}

function sanitizeStatus(raw: string): Status {
  var s = String(safeNormalizeText(raw) || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');

  if (!s) return 'PENDENTE';
  if (s === 'SEM_RESPOSTA') return 'RETORNO';
  if (s === 'LIGAR_MAIS_TARDE') return 'RETORNO';
  if (s.indexOf('RETORNO') === 0) return 'RETORNO';
  if (s === 'ATENDEU' || s === 'PESQUISA_FEITA') return 'PESQUISA_FEITA';

  if (s === 'NAO_ATENDEU' || s === 'NAO_ATENDEU_CAIXA_POSTAL' || s === 'CAIXA_POSTAL') {
    return 'NAO_ATENDEU';
  }

  if (s === 'OUTRA_CIDADE') return 'OUTRA_CIDADE';

  if (s === 'SO_MORA' || s === 'SO_VOTA' || s === 'NAO_PODE_FAZER_PESQUISA') {
    return 'NAO_PODE_FAZER_PESQUISA';
  }

  if (s === 'NUMERO_NAO_EXISTE' || s === 'NUMERO_INEXISTENTE') return 'NUMERO_NAO_EXISTE';
  if (s === 'REMOVER_DA_LISTA' || s === 'REMOVER_LISTA') return 'REMOVER_DA_LISTA';
  if (s === 'RECUSA') return 'RECUSA';
  if (s === 'PENDENTE') return 'PENDENTE';

  return 'PENDENTE';
}

function retornoLabelFromObs(obs: string) {
  var t = String(obs || '').trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) return t;

  var m = t.match(/RETORNO\s*[-–—]?\s*(\d{1,2}:\d{2})/i);
  return m && m[1] ? m[1] : '';
}

function validateHHMM(value: string) {
  var cleaned = String(value || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(cleaned)) return '';
  var parts = cleaned.split(':');
  var hh = Number(parts[0]);
  var mm = Number(parts[1]);

  if (isNaN(hh) || isNaN(mm)) return '';
  if (hh < 0 || hh > 23) return '';
  if (mm < 0 || mm > 59) return '';

  return zeroPad(hh, 2) + ':' + zeroPad(mm, 2);
}

function parseCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  var text = String(csv || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return { headers: [], rows: [] };

  var lines: string[] = [];
  var cur = '';
  var inQuotes = false;

  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);

    if (ch === '"') {
      var next = text.charAt(i + 1);
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === '\n' && !inQuotes) {
      lines.push(cur);
      cur = '';
      continue;
    }

    cur += ch;
  }

  if (cur) lines.push(cur);

  function splitLine(line: string) {
    var out: string[] = [];
    var c = '';
    var q = false;

    for (var j = 0; j < line.length; j++) {
      var ch2 = line.charAt(j);

      if (ch2 === '"') {
        var next2 = line.charAt(j + 1);
        if (q && next2 === '"') {
          c += '"';
          j++;
        } else {
          q = !q;
        }
        continue;
      }

      if (ch2 === ',' && !q) {
        out.push(c);
        c = '';
        continue;
      }

      c += ch2;
    }

    out.push(c);

    var cleaned: string[] = [];
    for (var k = 0; k < out.length; k++) {
      cleaned.push(String(out[k] || '').trim());
    }

    return cleaned;
  }

  var rawHeaders = splitLine(lines[0]);
  var headers: string[] = [];
  for (var h = 0; h < rawHeaders.length; h++) {
    headers.push(String(rawHeaders[h] || '').replace(/^"|"$/g, '').trim());
  }

  var rows: Record<string, string>[] = [];
  for (var r = 1; r < lines.length; r++) {
    var ln = lines[r];
    var cols = splitLine(ln);
    var obj: Record<string, string> = {};

    for (var c2 = 0; c2 < headers.length; c2++) {
      obj[headers[c2]] = String(cols[c2] == null ? '' : cols[c2]).replace(/^"|"$/g, '');
    }

    rows.push(obj);
  }

  return { headers: headers, rows: rows };
}

function pickCanonicalValue(obj: Record<string, string>, headers: string[], familyKey: string) {
  var matchingHeaders: string[] = [];

  for (var i = 0; i < headers.length; i++) {
    if (canonicalHeaderKey(headers[i]) === familyKey) matchingHeaders.push(headers[i]);
  }

  if (!matchingHeaders.length) return '';

  var values: string[] = [];
  for (var j = 0; j < matchingHeaders.length; j++) {
    var realHeader = matchingHeaders[j];
    values.push(String(obj[realHeader] == null ? '' : obj[realHeader]).trim());
  }

  for (var k = values.length - 1; k >= 0; k--) {
    if (values[k]) return values[k];
  }

  return values.length ? values[values.length - 1] : '';
}

function csvToRows(csv: string): Row[] {
  var parsed = parseCsv(csv);
  var headers = parsed.headers;
  var rows = parsed.rows;
  if (!rows.length) return [];

  var out: Row[] = [];

  for (var idx = 0; idx < rows.length; idx++) {
    var r = rows[idx];
    var lineCsv = pickCanonicalValue(r, headers, 'LINE');
    var IDP = pickCanonicalValue(r, headers, 'IDP') || String(idx + 1);
    var ESTADO = pickCanonicalValue(r, headers, 'ESTADO') || '';
    var CIDADE = pickCanonicalValue(r, headers, 'CIDADE') || '';
    var REGIAO_CIDADE = pickCanonicalValue(r, headers, 'REGIAO_CIDADE') || '';
    var TF1 = pickCanonicalValue(r, headers, 'TF1') || '';
    var TF2 = pickCanonicalValue(r, headers, 'TF2') || '';
    var statusCsv = pickCanonicalValue(r, headers, 'STATUS') || 'PENDENTE';
    var obsCsv = pickCanonicalValue(r, headers, 'OBSERVACAO') || '';
    var dtAlteracaoCsv = pickCanonicalValue(r, headers, 'DT_ALTERACAO') || '';
    var lineNum = Number(String(lineCsv || '').trim());

    out.push({
      id: 'row-' + String(idx + 1),
      LINE: isFinite(lineNum) && lineNum > 0 ? lineNum : idx + 1,
      IDP: String(IDP || ''),
      ESTADO: String(ESTADO || ''),
      CIDADE: String(CIDADE || ''),
      REGIAO_CIDADE: String(REGIAO_CIDADE || ''),
      TF1: String(TF1 || ''),
      TF2: String(TF2 || ''),
      STATUS: sanitizeStatus(statusCsv),
      OBSERVACAO: String(obsCsv || ''),
      DT_ALTERACAO: String(dtAlteracaoCsv || ''),
    });
  }

  return out;
}

function statusText(row: Row) {
  var s = row.STATUS;

  if (s === 'PESQUISA_FEITA') return 'PESQUISA FEITA';
  if (s === 'NAO_ATENDEU' || s === 'CAIXA_POSTAL') return 'NÃO ATENDEU/CAIXA POSTAL';
  if (s === 'NUMERO_NAO_EXISTE') return 'Nº NÃO EXISTE';
  if (s === 'RECUSA') return 'RECUSA';
  if (s === 'NAO_PODE_FAZER_PESQUISA') return 'NÃO PODE FAZER A PESQUISA';
  if (s === 'OUTRA_CIDADE') return row.OBSERVACAO ? 'OUTRA CIDADE • ' + row.OBSERVACAO : 'OUTRA CIDADE';

  if (s === 'RETORNO') {
    var hhmm = retornoLabelFromObs(row.OBSERVACAO);
    return hhmm ? 'RETORNO • ' + hhmm : 'RETORNO';
  }

  if (s === 'REMOVER_DA_LISTA') return 'REMOVER DA LISTA';
  return 'PENDENTE';
}

function statusColor(status: Status) {
  if (status === 'PESQUISA_FEITA') return COLORS.success;
  if (status === 'NAO_ATENDEU' || status === 'CAIXA_POSTAL') return COLORS.warning;
  if (status === 'NUMERO_NAO_EXISTE') return COLORS.danger;
  if (status === 'RECUSA') return '#be185d';
  if (status === 'RETORNO') return COLORS.info;
  if (status === 'OUTRA_CIDADE') return COLORS.orange;
  if (status === 'NAO_PODE_FAZER_PESQUISA') return COLORS.teal;
  if (status === 'REMOVER_DA_LISTA') return COLORS.purple;
  return COLORS.border;
}

function fallbackCopyText(text: string) {
  return new Promise<void>(function (resolve, reject) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.left = '-9999px';
    ta.style.top = '0';

    document.body.appendChild(ta);
    ta.focus();
    ta.select();

    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }

    document.body.removeChild(ta);

    if (!ok) {
      reject(new Error('Falha ao copiar'));
      return;
    }

    resolve();
  });
}

function obsToSave(status: Status, obs: string) {
  var t = String(obs || '').trim();

  if (status === 'RETORNO') {
    return retornoLabelFromObs(t) || t;
  }

  if (status === 'NAO_PODE_FAZER_PESQUISA') return '';
  return t;
}

function getLocationOriginSafe() {
  try {
    if (window.location.origin) return window.location.origin;
  } catch (e) {}

  try {
    return window.location.protocol + '//' + window.location.host;
  } catch (e) {}

  return '';
}

function countRowsByStatus(rows: Row[], target: Status | 'PENDENTE_ONLY') {
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    if (target === 'PENDENTE_ONLY') {
      if (rows[i].STATUS === 'PENDENTE') total++;
    } else {
      if (rows[i].STATUS === target) total++;
    }
  }
  return total;
}

function ActionBtn(props: {
  label: string;
  onClick: () => void;
  color?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      style={{
        ...styles.actionBtn,
        borderColor: props.color || COLORS.border,
        background: props.active ? '#f3f4f6' : '#ffffff',
      }}
    >
      {props.label}
    </button>
  );
}

function RowCard(props: {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  onApplyStatus: (row: Row, status: Status) => void;
  onSetRetorno: (row: Row, value: string) => void;
  onSetOutraCidade: (row: Row, value: string) => void;
  onCall: (row: Row, which: 'TF1' | 'TF2') => void;
  onCopy: (label: string, value: string) => void;
}) {
  var row = props.row;
  var retornoAtual = row.STATUS === 'RETORNO' ? retornoLabelFromObs(row.OBSERVACAO) : '';
  var outraCidadeAtual = row.STATUS === 'OUTRA_CIDADE' ? row.OBSERVACAO : '';

  return (
    <div
      style={{
        ...styles.rowCard,
        borderColor: statusColor(row.STATUS),
      }}
    >
      <button onClick={props.onToggle} style={styles.rowHeaderBtn}>
        <div style={styles.rowHeaderTop}>
          <div style={styles.rowId}>IDP {row.IDP}</div>
          <div
            style={{
              ...styles.statusBadge,
              borderColor: statusColor(row.STATUS),
            }}
          >
            {statusText(row)}
          </div>
        </div>

        <div style={styles.rowHeaderBottom}>
          <div style={styles.rowLine}>Linha: {row.LINE}</div>
          <div style={styles.rowPhones}>
            {row.TF1 ? 'TF1: ' + row.TF1 : 'TF1: —'}{' '}
            {' • '}
            {row.TF2 ? 'TF2: ' + row.TF2 : 'TF2: —'}
          </div>
        </div>

        {(row.CIDADE || row.ESTADO || row.REGIAO_CIDADE) ? (
          <div style={styles.rowGeo}>
            {row.CIDADE || '—'}
            {row.ESTADO ? ' / ' + row.ESTADO : ''}
            {row.REGIAO_CIDADE ? ' • ' + row.REGIAO_CIDADE : ''}
          </div>
        ) : null}
      </button>

      {props.expanded ? (
        <div style={styles.rowBody}>
          <div style={styles.sectionTitle}>Ações rápidas</div>

          <div style={styles.btnGrid}>
            <ActionBtn
              label="Pesquisa feita"
              color={COLORS.success}
              active={row.STATUS === 'PESQUISA_FEITA'}
              onClick={function () {
                props.onApplyStatus(row, 'PESQUISA_FEITA');
              }}
            />
            <ActionBtn
              label="Não atendeu"
              color={COLORS.warning}
              active={row.STATUS === 'NAO_ATENDEU'}
              onClick={function () {
                props.onApplyStatus(row, 'NAO_ATENDEU');
              }}
            />
            <ActionBtn
              label="Nº não existe"
              color={COLORS.danger}
              active={row.STATUS === 'NUMERO_NAO_EXISTE'}
              onClick={function () {
                props.onApplyStatus(row, 'NUMERO_NAO_EXISTE');
              }}
            />
            <ActionBtn
              label="Recusa"
              color={'#be185d'}
              active={row.STATUS === 'RECUSA'}
              onClick={function () {
                props.onApplyStatus(row, 'RECUSA');
              }}
            />
            <ActionBtn
              label="Não pode pesquisar"
              color={COLORS.teal}
              active={row.STATUS === 'NAO_PODE_FAZER_PESQUISA'}
              onClick={function () {
                props.onApplyStatus(row, 'NAO_PODE_FAZER_PESQUISA');
              }}
            />
            <ActionBtn
              label="Remover da lista"
              color={COLORS.purple}
              active={row.STATUS === 'REMOVER_DA_LISTA'}
              onClick={function () {
                props.onApplyStatus(row, 'REMOVER_DA_LISTA');
              }}
            />
            <ActionBtn
              label="Voltar para pendente"
              active={row.STATUS === 'PENDENTE'}
              onClick={function () {
                props.onApplyStatus(row, 'PENDENTE');
              }}
            />
          </div>

          <div style={styles.sectionTitle}>Retorno</div>
          <div style={styles.inlineRow}>
            <input
              type="text"
              inputMode="numeric"
              defaultValue={retornoAtual}
              placeholder="HH:MM"
              style={styles.input}
              id={'retorno-' + row.id}
            />
            <button
              style={styles.primaryBtn}
              onClick={function () {
                var el = document.getElementById('retorno-' + row.id) as HTMLInputElement | null;
                var val = el ? el.value : '';
                props.onSetRetorno(row, val);
              }}
            >
              Salvar retorno
            </button>
          </div>

          <div style={styles.sectionTitle}>Mora/Vota em outra cidade</div>
          <div style={styles.inlineRow}>
            <input
              type="text"
              defaultValue={outraCidadeAtual}
              placeholder="Digite a cidade ou NQ_RESPONDER"
              style={styles.input}
              id={'cidade-' + row.id}
            />
            <button
              style={styles.primaryBtn}
              onClick={function () {
                var el = document.getElementById('cidade-' + row.id) as HTMLInputElement | null;
                var val = el ? el.value : '';
                props.onSetOutraCidade(row, val);
              }}
            >
              Salvar cidade
            </button>
          </div>

          <div style={styles.sectionTitle}>Telefone / cópia</div>
          <div style={styles.btnGrid}>
            <button
              style={styles.primaryBtn}
              disabled={!row.TF1}
              onClick={function () {
                props.onCall(row, 'TF1');
              }}
            >
              Ligar TF1
            </button>
            <button
              style={styles.primaryBtn}
              disabled={!row.TF2}
              onClick={function () {
                props.onCall(row, 'TF2');
              }}
            >
              Ligar TF2
            </button>
            <button
              style={styles.secondaryBtn}
              disabled={!row.TF1}
              onClick={function () {
                props.onCopy('TF1', row.TF1);
              }}
            >
              Copiar TF1
            </button>
            <button
              style={styles.secondaryBtn}
              disabled={!row.TF2}
              onClick={function () {
                props.onCopy('TF2', row.TF2);
              }}
            >
              Copiar TF2
            </button>
            <button
              style={styles.secondaryBtn}
              onClick={function () {
                props.onCopy('IDP', row.IDP);
              }}
            >
              Copiar IDP
            </button>
          </div>

          {row.DT_ALTERACAO ? (
            <div style={styles.lastInfo}>Última alteração: {row.DT_ALTERACAO}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AppErrorFallback(props: { text: string }) {
  return (
    <div style={{ padding: 12 }}>
      <style>{globalCss}</style>
      <div style={styles.card}>
        <div style={{ padding: 14 }}>
          <div style={styles.title}>Erro no app</div>
          <div style={styles.errorText}>{props.text}</div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  var _a = useState(true),
    loading = _a[0],
    setLoading = _a[1];
  var _b = useState(''),
    error = _b[0],
    setError = _b[1];

  var _c = useState([] as Row[]),
    allRows = _c[0],
    setAllRows = _c[1];

  var _d = useState(null as PartePayload[] | null),
    payload = _d[0],
    setPayload = _d[1];

  var _e = useState('TODOS' as StatusFilter),
    statusFilter = _e[0],
    setStatusFilter = _e[1];

  var _f = useState(1),
    page = _f[0],
    setPage = _f[1];

  var _g = useState(''),
    expandedId = _g[0],
    setExpandedId = _g[1];

  var _h = useState({} as Record<string, DirtyRow>),
    dirty = _h[0],
    setDirty = _h[1];

  var _i = useState(false),
    saving = _i[0],
    setSaving = _i[1];

  var _j = useState(''),
    saveError = _j[0],
    setSaveError = _j[1];

  var _k = useState(''),
    lastSavedAt = _k[0],
    setLastSavedAt = _k[1];

  var _l = useState(''),
    toast = _l[0],
    setToast = _l[1];

  useEffect(function () {
    var entregaId = getEntregaIdOnly();

    if (!entregaId) {
      setLoading(false);
      setError('Sem entregaId na URL. Abra com: #/?entregaId=SEU_ID');
      return;
    }

    setLoading(true);
    setError('');

    requestText(API_GET_ENTREGA + '?entregasId=' + encodeURIComponent(entregaId))
      .then(function (resp) {
        return resp.text().then(function (raw) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status + ' • ' + (raw || 'Sem body'));
          if (!String(raw || '').trim()) throw new Error('Servidor respondeu vazio.');

          var data: any;
          try {
            data = JSON.parse(raw);
          } catch (e) {
            throw new Error('Resposta não é JSON.');
          }

          setPayload(Array.isArray(data) ? data : [data]);
        });
      })
      .catch(function (e: any) {
        setError(String((e && e.message) || e || 'Erro ao buscar payload'));
      })
      .then(function () {
        setLoading(false);
      });
  }, []);

  useEffect(function () {
    if (!payload || !payload.length) return;

    var item = payload[0];
    var csv = String((item && item.csv) || '');

    if (!csv.trim()) {
      setAllRows([]);
      setError('Payload chegou, mas não veio CSV.');
      return;
    }

    var rows = csvToRows(csv);
    setAllRows(rows);
    setError('');
  }, [payload]);

  useEffect(function () {
    setPage(1);
  }, [statusFilter]);

  useEffect(function () {
    var keys = Object.keys(dirty);
    if (!keys.length) return;

    var entrega_id = getEntregaIdOnly();
    if (!entrega_id) return;

    var timer = setTimeout(function () {
      var changes: any[] = [];

      for (var i = 0; i < keys.length; i++) {
        var lineKey = keys[i];
        var v = dirty[lineKey];
        if (!v) continue;

        changes.push({
          LINE: Number(lineKey),
          STATUS: v.STATUS,
          OBSERVACAO: obsToSave(v.STATUS, v.OBSERVACAO),
          DT_ALTERACAO: v.DT_ALTERACAO,
          UPDATED_AT_MS: v.UPDATED_AT_MS,
          ts: new Date().toISOString(),
        });
      }

      setSaving(true);
      setSaveError('');

      requestText(API_SAVE_PARTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrega_id: entrega_id,
          changes: changes,
        }),
      })
        .then(function (resp) {
          return resp.text().then(function (txt) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status + ' • ' + (txt || 'Sem body'));
            setDirty({});
            setLastSavedAt(new Date().toLocaleTimeString());
          });
        })
        .catch(function (e: any) {
          setSaveError(String((e && e.message) || e || 'Erro ao salvar'));
        })
        .then(function () {
          setSaving(false);
        });
    }, 900);

    return function () {
      clearTimeout(timer);
    };
  }, [dirty]);

  useEffect(function () {
    if (!toast) return;
    var timer = setTimeout(function () {
      setToast('');
    }, 2500);

    return function () {
      clearTimeout(timer);
    };
  }, [toast]);

  function showToast(message: string) {
    setToast(message);
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setAllRows(function (prev) {
      var out: Row[] = [];
      for (var i = 0; i < prev.length; i++) {
        var row = prev[i];
        if (row.id === id) {
          out.push({
            id: row.id,
            LINE: patch.LINE != null ? patch.LINE : row.LINE,
            IDP: patch.IDP != null ? patch.IDP : row.IDP,
            ESTADO: patch.ESTADO != null ? patch.ESTADO : row.ESTADO,
            CIDADE: patch.CIDADE != null ? patch.CIDADE : row.CIDADE,
            REGIAO_CIDADE: patch.REGIAO_CIDADE != null ? patch.REGIAO_CIDADE : row.REGIAO_CIDADE,
            TF1: patch.TF1 != null ? patch.TF1 : row.TF1,
            TF2: patch.TF2 != null ? patch.TF2 : row.TF2,
            STATUS: patch.STATUS != null ? patch.STATUS : row.STATUS,
            OBSERVACAO: patch.OBSERVACAO != null ? patch.OBSERVACAO : row.OBSERVACAO,
            DT_ALTERACAO: patch.DT_ALTERACAO != null ? patch.DT_ALTERACAO : row.DT_ALTERACAO,
          });
        } else {
          out.push(row);
        }
      }
      return out;
    });
  }

  function markDirty(row: Row, nextStatus: Status, nextObs: string, stamp: string) {
    setDirty(function (prev) {
      var lineKey = String(row.LINE);
      var copy: Record<string, DirtyRow> = {};
      var keys = Object.keys(prev);

      for (var i = 0; i < keys.length; i++) {
        copy[keys[i]] = prev[keys[i]];
      }

      copy[lineKey] = {
        STATUS: nextStatus,
        OBSERVACAO: nextObs,
        DT_ALTERACAO: stamp,
        UPDATED_AT_MS: Date.now(),
      };

      return copy;
    });
  }

  function applyStatus(row: Row, status: Status, obs?: string) {
    var nextObs = typeof obs === 'string' ? obs : row.OBSERVACAO;

    if (status === 'PENDENTE') nextObs = '';
    if (status === 'NAO_PODE_FAZER_PESQUISA') nextObs = '';
    if (status === 'PESQUISA_FEITA') nextObs = '';
    if (status === 'NAO_ATENDEU') nextObs = '';
    if (status === 'NUMERO_NAO_EXISTE') nextObs = '';
    if (status === 'RECUSA') nextObs = '';
    if (status === 'REMOVER_DA_LISTA') nextObs = '';

    var stamp = nowLocalStampSemMs();

    updateRow(row.id, {
      STATUS: status,
      OBSERVACAO: nextObs,
      DT_ALTERACAO: stamp,
    });

    markDirty(row, status, nextObs, stamp);
  }

  function setRetorno(row: Row, value: string) {
    var hhmm = validateHHMM(value);
    if (!hhmm) {
      window.alert('Digite o retorno no formato HH:MM.');
      return;
    }

    applyStatus(row, 'RETORNO', hhmm);
    showToast('Retorno salvo: ' + hhmm);
  }

  function setOutraCidade(row: Row, value: string) {
    var city = String(value || '').trim();
    if (!city) {
      window.alert('Digite a cidade ou NQ_RESPONDER.');
      return;
    }

    applyStatus(row, 'OUTRA_CIDADE', city);
    showToast('Cidade salva.');
  }

  function callPhone(row: Row, which: 'TF1' | 'TF2') {
    var tel = telToDial(row[which]);
    if (!tel) {
      showToast('Telefone vazio.');
      return;
    }
    window.location.href = 'tel:' + tel;
  }

  function copyToClipboard(label: string, value: string) {
    var v = String(value || '').trim();
    if (!v) {
      showToast('Valor vazio.');
      return;
    }

    var promise: Promise<any>;

    try {
      if ((navigator as any) && (navigator as any).clipboard && (navigator as any).clipboard.writeText) {
        promise = (navigator as any).clipboard.writeText(v);
      } else {
        promise = fallbackCopyText(v);
      }
    } catch (e) {
      promise = fallbackCopyText(v);
    }

    promise
      .then(function () {
        showToast(label + ' copiado.');
      })
      .catch(function () {
        fallbackCopyText(v)
          .then(function () {
            showToast(label + ' copiado.');
          })
          .catch(function () {
            showToast('Não foi possível copiar.');
          });
      });
  }

  function getFilteredRows() {
    var out: Row[] = [];

    for (var i = 0; i < allRows.length; i++) {
      var row = allRows[i];

      if (statusFilter === 'TODOS') {
        out.push(row);
      } else if (statusFilter === 'PENDENTES') {
        if (row.STATUS === 'PENDENTE') out.push(row);
      } else {
        if (row.STATUS === statusFilter) out.push(row);
      }
    }

    return out;
  }

  var filteredRows = getFilteredRows();
  var totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  var currentPage = page > totalPages ? totalPages : page;
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageRows = filteredRows.slice(start, start + PAGE_SIZE);

  var pendentes = countRowsByStatus(filteredRows, 'PENDENTE_ONLY');
  var tratados = filteredRows.length - pendentes;
  var dirtyCount = Object.keys(dirty).length;

  var hintLink = getLocationOriginSafe() + (window.location.pathname || '') + '#/?entregaId=SEU_ENTREGA_ID';

  try {
    return (
      <div style={styles.app}>
        <style>{globalCss}</style>

        <div style={styles.topCard}>
          <div style={styles.title}>Atendimento Legacy</div>
          <div style={styles.sub}>
            Registros: <b>{filteredRows.length}</b> • Tratados: <b>{tratados}</b> • Pendentes: <b>{pendentes}</b>
          </div>
          <div style={styles.sub}>
            Salvando: <b>{saving ? 'SIM' : 'NÃO'}</b>
            {lastSavedAt ? (
              <span>
                {' '}
                • Último: <b>{lastSavedAt}</b>
              </span>
            ) : null}
          </div>
          <div style={styles.sub}>
            Pendentes de envio: <b>{dirtyCount}</b>
          </div>

          {saveError ? <div style={styles.errorBox}>❌ {saveError}</div> : null}

          <div style={styles.filterWrap}>
            <select
              value={statusFilter}
              onChange={function (e) {
                setStatusFilter(e.target.value as StatusFilter);
              }}
              style={styles.select}
            >
              <option value="TODOS">Todos</option>
              <option value="PENDENTES">Pendentes</option>
              <option value="PESQUISA_FEITA">Pesquisa Feita</option>
              <option value="NAO_ATENDEU">Não atendeu</option>
              <option value="NUMERO_NAO_EXISTE">Nº não existe</option>
              <option value="RECUSA">Recusa</option>
              <option value="RETORNO">Retorno</option>
              <option value="OUTRA_CIDADE">Outra cidade</option>
              <option value="NAO_PODE_FAZER_PESQUISA">Não pode pesquisar</option>
              <option value="REMOVER_DA_LISTA">Remover da lista</option>
            </select>

            <button
              style={styles.secondaryBtn}
              onClick={function () {
                setStatusFilter('TODOS');
              }}
            >
              Limpar filtro
            </button>
          </div>

          <div style={styles.pagination}>
            <button
              style={styles.secondaryBtn}
              disabled={currentPage <= 1}
              onClick={function () {
                setPage(currentPage - 1);
              }}
            >
              Anterior
            </button>

            <div style={styles.pageInfo}>
              Página {currentPage} / {totalPages}
            </div>

            <button
              style={styles.primaryBtn}
              disabled={currentPage >= totalPages}
              onClick={function () {
                setPage(currentPage + 1);
              }}
            >
              Próxima
            </button>
          </div>
        </div>

        {loading ? (
          <div style={styles.card}>
            <div style={styles.loadingBox}>Carregando...</div>
          </div>
        ) : error ? (
          <div style={styles.card}>
            <div style={{ padding: 14 }}>
              <div style={styles.errorTitle}>Erro</div>
              <div style={styles.errorText}>{error}</div>
              <div style={styles.hintBox}>{hintLink}</div>
            </div>
          </div>
        ) : !allRows.length ? (
          <div style={styles.card}>
            <div style={styles.loadingBox}>Nenhum registro encontrado.</div>
          </div>
        ) : (
          <div>
            {pageRows.length ? (
              pageRows.map(function (row) {
                return (
                  <RowCard
                    key={row.id}
                    row={row}
                    expanded={expandedId === row.id}
                    onToggle={function () {
                      setExpandedId(expandedId === row.id ? '' : row.id);
                    }}
                    onApplyStatus={function (r, status) {
                      applyStatus(r, status);
                    }}
                    onSetRetorno={function (r, value) {
                      setRetorno(r, value);
                    }}
                    onSetOutraCidade={function (r, value) {
                      setOutraCidade(r, value);
                    }}
                    onCall={function (r, which) {
                      callPhone(r, which);
                    }}
                    onCopy={copyToClipboard}
                  />
                );
              })
            ) : (
              <div style={styles.card}>
                <div style={styles.loadingBox}>Nenhum registro nesta página.</div>
              </div>
            )}
          </div>
        )}

        {toast ? <div style={styles.toast}>{toast}</div> : null}
      </div>
    );
  } catch (e: any) {
    return <AppErrorFallback text={String((e && (e.message || e.stack)) || e || 'Erro desconhecido')} />;
  }
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    padding: 10,
  },
  topCard: {
    background: COLORS.card,
    border: '1px solid ' + COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  card: {
    background: COLORS.card,
    border: '1px solid ' + COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.text,
  },
  sub: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 6,
  },
  filterWrap: {
    marginTop: 10,
  },
  select: {
    width: '100%',
    height: 42,
    border: '1px solid ' + COLORS.border,
    borderRadius: 10,
    background: '#fff',
    padding: '0 10px',
    marginBottom: 8,
  },
  pagination: {
    marginTop: 10,
  },
  pageInfo: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 8,
  },
  rowCard: {
    background: COLORS.card,
    border: '1px solid ' + COLORS.border,
    borderLeftWidth: 5,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowHeaderBtn: {
    display: 'block',
    width: '100%',
    border: 'none',
    background: '#fff',
    textAlign: 'left',
    padding: 12,
    cursor: 'pointer',
  },
  rowHeaderTop: {
    marginBottom: 8,
  },
  rowHeaderBottom: {
    marginTop: 6,
  },
  rowId: {
    fontSize: 15,
    fontWeight: 700,
    color: COLORS.text,
    marginBottom: 8,
  },
  rowLine: {
    fontSize: 12,
    color: COLORS.muted,
  },
  rowPhones: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
    wordBreak: 'break-word',
  },
  rowGeo: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 6,
    wordBreak: 'break-word',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '5px 8px',
    borderRadius: 999,
    border: '1px solid ' + COLORS.border,
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.text,
    background: COLORS.card2,
  },
  rowBody: {
    borderTop: '1px solid ' + COLORS.border,
    background: COLORS.card2,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 10,
  },
  btnGrid: {
    marginBottom: 6,
  },
  actionBtn: {
    display: 'inline-block',
    width: '100%',
    minHeight: 42,
    border: '1px solid ' + COLORS.border,
    borderRadius: 10,
    background: '#fff',
    color: COLORS.text,
    fontWeight: 700,
    marginBottom: 8,
    cursor: 'pointer',
    padding: '0 10px',
  },
  primaryBtn: {
    display: 'inline-block',
    width: '100%',
    minHeight: 42,
    border: '1px solid ' + COLORS.primary,
    borderRadius: 10,
    background: COLORS.primary,
    color: COLORS.primaryText,
    fontWeight: 700,
    marginBottom: 8,
    cursor: 'pointer',
    padding: '0 10px',
  },
  secondaryBtn: {
    display: 'inline-block',
    width: '100%',
    minHeight: 42,
    border: '1px solid ' + COLORS.border,
    borderRadius: 10,
    background: '#fff',
    color: COLORS.text,
    fontWeight: 700,
    marginBottom: 8,
    cursor: 'pointer',
    padding: '0 10px',
  },
  inlineRow: {
    marginBottom: 8,
  },
  input: {
    width: '100%',
    height: 42,
    border: '1px solid ' + COLORS.border,
    borderRadius: 10,
    padding: '0 10px',
    background: '#fff',
    color: COLORS.text,
    marginBottom: 8,
  },
  lastInfo: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 8,
  },
  loadingBox: {
    padding: 16,
    fontSize: 14,
    color: COLORS.text,
  },
  errorBox: {
    marginTop: 8,
    padding: 10,
    border: '1px solid ' + COLORS.danger,
    borderRadius: 10,
    background: '#fff',
    color: COLORS.text,
    fontSize: 12,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: COLORS.text,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 8,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  hintBox: {
    marginTop: 10,
    padding: 10,
    border: '1px solid ' + COLORS.border,
    borderRadius: 10,
    fontSize: 12,
    color: COLORS.muted,
    wordBreak: 'break-all',
    background: '#fff',
  },
  toast: {
    position: 'fixed',
    left: '50%',
    bottom: 10,
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,.88)',
    color: '#fff',
    padding: '10px 12px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    maxWidth: '92vw',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    zIndex: 9999,
  },
};