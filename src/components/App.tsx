import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

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

type OutraCidadeTipo = 'MORA_VOTA' | 'NQ_RESPONDER';

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

type IbgeMunicipio = {
  id: number;
  nome: string;
  microrregiao?: {
    mesorregiao?: {
      UF?: { sigla?: string; nome?: string };
    };
  };
};

type SimpleResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

const PAGE_SIZE = 20;

const API_GET_ENTREGA = 'https://n8n.srv962474.hstgr.cloud/webhook/entregas';
const API_SAVE_PARTE = 'https://n8n.srv962474.hstgr.cloud/webhook/parte/salvar';
const IBGE_MUNICIPIOS_API = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';

const COLORS = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  text: '#000000',
  textMuted: '#374151',
  border: '#D1D5DB',

  primary: '#000000',
  primaryText: '#FFFFFF',
  secondary: '#FFFFFF',
  secondaryText: '#000000',

  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#EF4444',
  orange: '#F97316',
  blueDark: '#1E3A8A',
  blueLight: '#38BDF8',
  purple: '#7C3AED',
  teal: '#0F766E',
  pink: '#BE185D',

  shadow: '0 10px 30px rgba(0,0,0,.10)',
  radius: 15,
};

const globalCss = `
html, body, #root {
  height: 100%;
}
body{
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #F3F4F6;
  margin: 0;
  padding: 0;
  color: #000000;
}
*{ box-sizing: border-box; }
button:disabled{ opacity: .55; cursor: not-allowed !important; }
input, select, button, textarea{
  font-family: inherit;
}
`;

function zeroPad(value: number | string, size: number) {
  const text = String(value == null ? '' : value);
  if ((text as any).padStart) {
    return text.padStart(size, '0');
  }
  const zeros = '00000000000000000000';
  return (zeros + text).slice(-size);
}

function safeNormalizeText(value: string) {
  const text = String(value || '').replace(/^\uFEFF/, '');
  try {
    if ((text as any).normalize) {
      return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
  } catch {}
  return text;
}

function parseSimpleQueryString(qs: string) {
  const out: Record<string, string> = {};
  const clean = String(qs || '').replace(/^\?/, '').trim();
  if (!clean) return out;

  const parts = clean.split('&');
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i];
    if (!piece) continue;

    const eq = piece.indexOf('=');
    let key = piece;
    let val = '';

    if (eq >= 0) {
      key = piece.slice(0, eq);
      val = piece.slice(eq + 1);
    }

    try {
      key = decodeURIComponent(String(key || '').replace(/\+/g, ' '));
    } catch {}
    try {
      val = decodeURIComponent(String(val || '').replace(/\+/g, ' '));
    } catch {}

    out[key] = val;
  }

  return out;
}

function getEntregaIdOnly(): string {
  try {
    const hash = window.location.hash || '';
    const qi = hash.indexOf('?');

    if (qi >= 0) {
      const hashQs = hash.slice(qi + 1);

      try {
        if (typeof URLSearchParams !== 'undefined') {
          const hp = new URLSearchParams(hashQs);
          const v = String(hp.get('entregaId') || '').trim();
          if (v && v !== 'undefined' && v !== 'null') return v;
        }
      } catch {}

      const parsedHash = parseSimpleQueryString(hashQs);
      const vHash = String(parsedHash.entregaId || '').trim();
      if (vHash && vHash !== 'undefined' && vHash !== 'null') return vHash;
    }

    const searchQs = window.location.search || '';

    try {
      if (typeof URLSearchParams !== 'undefined') {
        const sp = new URLSearchParams(searchQs);
        const v2 = String(sp.get('entregaId') || '').trim();
        if (v2 && v2 !== 'undefined' && v2 !== 'null') return v2;
      }
    } catch {}

    const parsedSearch = parseSimpleQueryString(searchQs);
    const vSearch = String(parsedSearch.entregaId || '').trim();
    if (vSearch && vSearch !== 'undefined' && vSearch !== 'null') return vSearch;
  } catch {}

  return '';
}

function safeTel(v: string) {
  return String(v || '')
    .trim()
    .replace(/[^\d+]/g, '');
}

function telToDial(v: string) {
  const digits = safeTel(v).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.indexOf('0') === 0 || digits.indexOf('55') === 0) return digits;
  return '0' + digits;
}

function nowLocalStampPreciso() {
  const d = new Date();
  const dd = zeroPad(d.getDate(), 2);
  const mm = zeroPad(d.getMonth() + 1, 2);
  const yyyy = String(d.getFullYear());
  const hh = zeroPad(d.getHours(), 2);
  const mi = zeroPad(d.getMinutes(), 2);
  const ss = zeroPad(d.getSeconds(), 2);
  const ms = zeroPad(d.getMilliseconds(), 3);
  return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi + ':' + ss + '.' + ms;
}

function normalizeHeader(h: string) {
  return safeNormalizeText(h).trim().toUpperCase();
}

function canonicalHeaderKey(h: string) {
  const n = normalizeHeader(h)
    .replace(/[.\-\/\\]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const semSufixo = n.replace(/_\d+$/, '');

  if (semSufixo === 'STATUS') return 'STATUS';
  if (semSufixo === 'OBSERVACAO') return 'OBSERVACAO';

  const dtCompacto = semSufixo.replace(/_/g, '');
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
  const s = String(safeNormalizeText(raw) || '')
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

  if (s === 'NUMERO_NAO_EXISTE' || s === 'NUMERO_INEXISTENTE') {
    return 'NUMERO_NAO_EXISTE';
  }

  if (s === 'REMOVER_DA_LISTA' || s === 'REMOVER_LISTA') {
    return 'REMOVER_DA_LISTA';
  }

  if (s === 'RECUSA') return 'RECUSA';
  if (s === 'PENDENTE') return 'PENDENTE';

  return 'PENDENTE';
}

function buildOutraCidadeObs(tipo: OutraCidadeTipo, valor?: string) {
  const v = String(valor || '').trim();
  if (tipo === 'NQ_RESPONDER') return 'NQ_RESPONDER';
  return v || 'MORA_VOTA';
}

function outraCidadeFromObs(obs: string) {
  const t = String(obs || '').trim();
  if (t === 'NQ_RESPONDER') return '';
  return t;
}

function outraCidadeLabel(obs: string) {
  const t = String(obs || '').trim();
  if (t === 'NQ_RESPONDER') return 'MORA/VOTA EM OUTRA CIDADE • NQ RESPONDER';
  return t ? 'MORA/VOTA EM OUTRA CIDADE • ' + t : 'MORA/VOTA EM OUTRA CIDADE';
}

function retornoLabelFromObs(obs: string) {
  const t = String(obs || '').trim();

  if (/^\d{1,2}:\d{2}$/.test(t)) return t;

  const m = t.match(/RETORNO\s*[-–—]?\s*(\d{1,2}:\d{2})/i);
  return m && m[1] ? m[1] : '';
}

function obsToSave(status: Status, obs: string) {
  const t = String(obs || '').trim();

  if (status === 'OUTRA_CIDADE') return t;

  if (status === 'RETORNO') {
    const hhmm = retornoLabelFromObs(t) || t.replace(/^RETORNO\s*[-–—]?\s*/i, '').trim();
    return hhmm;
  }

  if (status === 'NAO_PODE_FAZER_PESQUISA') return '';

  return t;
}

function parseCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = String(csv || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return { headers: [], rows: [] };

  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '"') {
      const next = text.charAt(i + 1);
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
    const out: string[] = [];
    let c = '';
    let q = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (ch === '"') {
        const next = line.charAt(i + 1);
        if (q && next === '"') {
          c += '"';
          i++;
        } else {
          q = !q;
        }
        continue;
      }
      if (ch === ',' && !q) {
        out.push(c);
        c = '';
        continue;
      }
      c += ch;
    }

    out.push(c);

    const cleaned: string[] = [];
    for (let j = 0; j < out.length; j++) {
      cleaned.push(String(out[j] || '').trim());
    }
    return cleaned;
  }

  const rawHeaders = splitLine(lines[0]);
  const headers: string[] = [];
  for (let i = 0; i < rawHeaders.length; i++) {
    headers.push(String(rawHeaders[i] || '').replace(/^"|"$/g, '').trim());
  }

  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    const cols = splitLine(ln);
    const obj: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = String(cols[j] == null ? '' : cols[j]).replace(/^"|"$/g, '');
    }

    rows.push(obj);
  }

  return { headers, rows };
}

function pickCanonicalValue(obj: Record<string, string>, headers: string[], familyKey: string) {
  const matchingHeaders: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    if (canonicalHeaderKey(headers[i]) === familyKey) {
      matchingHeaders.push(headers[i]);
    }
  }

  if (!matchingHeaders.length) return '';

  const values: string[] = [];
  for (let i = 0; i < matchingHeaders.length; i++) {
    const realHeader = matchingHeaders[i];
    values.push(String(obj[realHeader] == null ? '' : obj[realHeader]).trim());
  }

  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i]) return values[i];
  }

  return values.length ? values[values.length - 1] : '';
}

function csvToRows(csv: string): Row[] {
  const parsed = parseCsv(csv);
  const headers = parsed.headers;
  const rows = parsed.rows;

  if (!rows.length) return [];

  const out: Row[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const lineCsv = pickCanonicalValue(r, headers, 'LINE');
    const IDP = pickCanonicalValue(r, headers, 'IDP') || String(idx + 1);

    const ESTADO = pickCanonicalValue(r, headers, 'ESTADO') || '';
    const CIDADE = pickCanonicalValue(r, headers, 'CIDADE') || '';
    const REGIAO_CIDADE = pickCanonicalValue(r, headers, 'REGIAO_CIDADE') || '';

    const TF1 = pickCanonicalValue(r, headers, 'TF1') || '';
    const TF2 = pickCanonicalValue(r, headers, 'TF2') || '';

    const statusCsv = pickCanonicalValue(r, headers, 'STATUS') || 'PENDENTE';
    const obsCsv = pickCanonicalValue(r, headers, 'OBSERVACAO') || '';
    const dtAlteracaoCsv = pickCanonicalValue(r, headers, 'DT_ALTERACAO') || '';

    const lineNum = Number(String(lineCsv || '').trim());

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
  const s = row.STATUS;

  if (s === 'PESQUISA_FEITA') return 'PESQUISA FEITA';
  if (s === 'NAO_ATENDEU' || s === 'CAIXA_POSTAL') return 'NÃO ATENDEU/CAIXA POSTAL';
  if (s === 'NUMERO_NAO_EXISTE') return 'Nº NÃO EXISTE';
  if (s === 'RECUSA') return 'RECUSA';
  if (s === 'NAO_PODE_FAZER_PESQUISA') return 'NÃO PODE FAZER A PESQUISA';

  if (s === 'OUTRA_CIDADE') {
    return outraCidadeLabel(row.OBSERVACAO);
  }

  if (s === 'RETORNO') {
    const hhmm = retornoLabelFromObs(row.OBSERVACAO);
    return hhmm ? 'RETORNO • ' + hhmm : 'RETORNO';
  }

  if (s === 'REMOVER_DA_LISTA') return 'REMOVER DA LISTA';

  return 'PENDENTE';
}

function statusVars(s: Status) {
  switch (s) {
    case 'PESQUISA_FEITA':
      return { bd: COLORS.success, bg: 'rgba(22,163,74,.32)' };
    case 'OUTRA_CIDADE':
      return { bd: COLORS.orange, bg: 'rgba(249,115,22,.34)' };
    case 'NAO_PODE_FAZER_PESQUISA':
      return { bd: COLORS.teal, bg: 'rgba(15,118,110,.28)' };
    case 'RETORNO':
      return { bd: COLORS.blueDark, bg: 'rgba(30,58,138,.30)' };
    case 'NUMERO_NAO_EXISTE':
      return { bd: COLORS.danger, bg: 'rgba(239,68,68,.34)' };
    case 'RECUSA':
      return { bd: COLORS.pink, bg: 'rgba(190,24,93,.22)' };
    case 'NAO_ATENDEU':
    case 'CAIXA_POSTAL':
      return { bd: COLORS.warning, bg: 'rgba(245,158,11,.34)' };
    case 'REMOVER_DA_LISTA':
      return { bd: COLORS.purple, bg: 'rgba(124,58,237,.24)' };
    default:
      return { bd: COLORS.border, bg: 'rgba(0,0,0,.06)' };
  }
}

function rowBg(status: Status) {
  switch (status) {
    case 'NAO_ATENDEU':
    case 'CAIXA_POSTAL':
      return 'rgba(245,158,11,.28)';
    case 'OUTRA_CIDADE':
      return 'rgba(249,115,22,.28)';
    case 'NAO_PODE_FAZER_PESQUISA':
      return 'rgba(15,118,110,.20)';
    case 'PESQUISA_FEITA':
      return 'rgba(22,163,74,.26)';
    case 'RETORNO':
      return 'rgba(30,58,138,.24)';
    case 'NUMERO_NAO_EXISTE':
      return 'rgba(239,68,68,.24)';
    case 'RECUSA':
      return 'rgba(190,24,93,.18)';
    case 'REMOVER_DA_LISTA':
      return 'rgba(124,58,237,.20)';
    default:
      return 'transparent';
  }
}

function getUfNomeFromMunicipio(m: IbgeMunicipio) {
  return (
    (m &&
      m.microrregiao &&
      m.microrregiao.mesorregiao &&
      m.microrregiao.mesorregiao.UF &&
      (m.microrregiao.mesorregiao.UF.nome || m.microrregiao.mesorregiao.UF.sigla)) ||
    ''
  );
}

function cityLabel(nome: string, estadoNome: string) {
  const n = String(nome || '').trim();
  const e = String(estadoNome || '').trim();
  if (!n) return '';
  return e ? n + '/' + e : n;
}

function getLocationOriginSafe() {
  try {
    if (window.location.origin) return window.location.origin;
  } catch {}

  try {
    return window.location.protocol + '//' + window.location.host;
  } catch {}

  return '';
}

function supportsFetch() {
  try {
    return typeof fetch !== 'undefined';
  } catch {
    return false;
  }
}

function xhrRequest(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<SimpleResponse>(function (resolve, reject) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(options && options.method ? options.method : 'GET', url, true);

      const headers = (options && options.headers) || {};
      const keys = Object.keys(headers);
      for (let i = 0; i < keys.length; i++) {
        xhr.setRequestHeader(keys[i], headers[keys[i]]);
      }

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;

        const responseText = xhr.responseText || '';
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

function validateHHMM(value: string) {
  const cleaned = String(value || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(cleaned)) return '';
  const parts = cleaned.split(':');
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (isNaN(hh) || isNaN(mm)) return '';
  if (hh < 0 || hh > 23) return '';
  if (mm < 0 || mm > 59) return '';
  return zeroPad(hh, 2) + ':' + zeroPad(mm, 2);
}

async function fallbackCopyText(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'true');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(ta);

  if (!ok) {
    throw new Error('Falha ao copiar');
  }
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorText: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorText: '' };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      errorText: String((error && (error.stack || error.message)) || error || 'Erro desconhecido'),
    };
  }

  componentDidCatch(error: any) {
    try {
      console.error('Mini App error:', error);
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          <style>{globalCss}</style>
          <div style={styles.card}>
            <div style={{ padding: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>⚠️ Erro no Mini App</div>
              <div style={{ marginTop: 8, color: COLORS.textMuted, fontSize: 13 }}>
                O aplicativo encontrou um erro de compatibilidade ou execução.
              </div>
              <pre
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: COLORS.surfaceMuted,
                  border: '1px solid ' + COLORS.border,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                }}
              >
                {this.state.errorText}
              </pre>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children as any;
  }
}

function StatusPill(props: { row: Row }) {
  const c = statusVars(props.row.STATUS);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 9px',
        borderRadius: 999,
        border: '2px solid ' + c.bd,
        background: c.bg,
        fontWeight: 900,
        fontSize: 11,
        color: COLORS.text,
        whiteSpace: 'nowrap',
      }}
    >
      {statusText(props.row)}
    </span>
  );
}

function ActionButton(props: {
  active: boolean;
  kind: 'danger' | 'warning' | 'success' | 'blueDark' | 'blueLight' | 'orange' | 'purple' | 'teal' | 'pink';
  children: React.ReactNode;
  onClick: () => void;
}) {
  const kind = props.kind;

  const base =
    kind === 'danger'
      ? { border: '2px solid rgba(239,68,68,.70)', background: 'rgba(239,68,68,.28)', color: COLORS.text }
      : kind === 'orange'
      ? { border: '2px solid rgba(249,115,22,.70)', background: 'rgba(249,115,22,.28)', color: COLORS.text }
      : kind === 'warning'
      ? { border: '2px solid rgba(245,158,11,.70)', background: 'rgba(245,158,11,.28)', color: COLORS.text }
      : kind === 'blueDark'
      ? { border: '2px solid rgba(30,58,138,.65)', background: 'rgba(30,58,138,.24)', color: COLORS.text }
      : kind === 'blueLight'
      ? { border: '2px solid rgba(56,189,248,.65)', background: 'rgba(56,189,248,.22)', color: COLORS.text }
      : kind === 'purple'
      ? { border: '2px solid rgba(124,58,237,.65)', background: 'rgba(124,58,237,.22)', color: COLORS.text }
      : kind === 'teal'
      ? { border: '2px solid rgba(15,118,110,.65)', background: 'rgba(15,118,110,.18)', color: COLORS.text }
      : kind === 'pink'
      ? { border: '2px solid rgba(190,24,93,.65)', background: 'rgba(190,24,93,.16)', color: COLORS.text }
      : { border: '2px solid rgba(22,163,74,.65)', background: 'rgba(22,163,74,.24)', color: COLORS.text };

  return (
    <button
      onClick={props.onClick}
      style={{
        ...styles.btnAction,
        ...base,
        ...(props.active ? styles.btnActive : {}),
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      {props.children}
    </button>
  );
}

function MiniTel(props: {
  label: string;
  value: string;
  disabled: boolean;
  onClick: () => void;
  onCopy: () => void;
}) {
  const enabled = !props.disabled;

  return (
    <div style={{ display: 'inline-block', marginRight: 8, marginBottom: 8 }}>
      <button
        disabled={!enabled}
        onClick={props.onClick}
        style={{
          ...styles.btn,
          ...styles.btnPrimary,
          background: enabled ? COLORS.primary : COLORS.surfaceMuted,
          color: enabled ? COLORS.primaryText : COLORS.textMuted,
          borderColor: COLORS.border,
          padding: '9px 12px',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 900,
          cursor: enabled ? 'pointer' : 'not-allowed',
          whiteSpace: 'nowrap',
          marginRight: 8,
        }}
        title={props.value || ''}
      >
        {'Ligar ' + props.label + ' 📞'}
      </button>

      <button
        disabled={!props.value}
        onClick={props.onCopy}
        style={{
          ...styles.btn,
          ...styles.btnPrimary,
          background: props.value ? COLORS.primary : COLORS.surfaceMuted,
          color: props.value ? COLORS.primaryText : COLORS.textMuted,
          borderColor: COLORS.border,
          padding: '9px 12px',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 900,
          cursor: props.value ? 'pointer' : 'not-allowed',
          whiteSpace: 'nowrap',
        }}
        title={props.value ? 'Copiar ' + props.label : ''}
      >
        {'Copiar ' + props.label}
      </button>
    </div>
  );
}

function RetornoModal(props: {
  open: boolean;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (hhmm: string) => void;
}) {
  const [value, setValue] = useState(props.initialValue || '');

  useEffect(() => {
    setValue(props.initialValue || '');
  }, [props.initialValue, props.open]);

  if (!props.open) return null;

  return (
    <div onClick={props.onCancel} style={stylesModal.overlay}>
      <div
        onClick={function (e) {
          e.stopPropagation();
        }}
        style={stylesModal.box}
      >
        <div style={stylesModal.header}>
          <div style={stylesModal.title}>⏰ Agendar retorno</div>
          <div style={stylesModal.sub}>Digite no formato HH:MM</div>
        </div>

        <div style={{ padding: 12 }}>
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={function (e) {
              setValue(e.target.value);
            }}
            placeholder="Ex: 14:30"
            style={stylesModal.input}
          />

          <div style={stylesModal.rowBtns}>
            <button style={styles.btn} onClick={props.onCancel}>
              Cancelar
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={function () {
                const cleaned = validateHHMM(value);
                if (!cleaned) {
                  window.alert('Digite um horário válido no formato HH:MM.');
                  return;
                }
                props.onConfirm(cleaned);
              }}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutraCidadeModal(props: {
  open: boolean;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (payload: { tipo: OutraCidadeTipo; city: string }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [all, setAll] = useState<{ label: string; nome: string; estado: string }[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (!props.open) return;

    setLoadErr('');
    setQuery(props.initialValue || '');
    setSelected(props.initialValue || '');

    if (all.length) return;

    (async function () {
      try {
        setLoading(true);
        setLoadErr('');

        const resp = await requestText(IBGE_MUNICIPIOS_API);
        const raw = await resp.text().catch(function () {
          return '';
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' • ' + (raw || 'Sem body'));

        let data: any;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error('Resposta do IBGE não é JSON.');
        }

        const list: IbgeMunicipio[] = Array.isArray(data) ? data : [];

        const mapped: { label: string; nome: string; estado: string }[] = [];

        for (let i = 0; i < list.length; i++) {
          const m = list[i];
          const estado = getUfNomeFromMunicipio(m);
          const nome = String((m && m.nome) || '').trim();
          const label = cityLabel(nome, estado);
          if (label) {
            mapped.push({ label, nome, estado });
          }
        }

        mapped.sort(function (a, b) {
          return a.label.localeCompare(b.label, 'pt-BR');
        });

        setAll(mapped);
      } catch (e: any) {
        setLoadErr(String((e && e.message) || e || 'Erro ao carregar cidades do IBGE'));
      } finally {
        setLoading(false);
      }
    })();
  }, [props.open, props.initialValue, all.length]);

  const options = useMemo(function () {
    const q = String(query || '').trim().toLowerCase();

    if (!all.length) return [];

    if (!q) return all.slice(0, 50);

    const startsWithNome = all.filter(function (c) {
      return String(c.nome || '').trim().toLowerCase().indexOf(q) === 0;
    });

    if (startsWithNome.length) {
      return startsWithNome
        .sort(function (a, b) {
          const aNome = a.nome.toLowerCase();
          const bNome = b.nome.toLowerCase();

          if (aNome === q && bNome !== q) return -1;
          if (bNome === q && aNome !== q) return 1;

          return a.label.localeCompare(b.label, 'pt-BR');
        })
        .slice(0, 50);
    }

    const startsWithWordInNome = all.filter(function (c) {
      const pieces = String(c.nome || '').trim().toLowerCase().split(/\s+/);
      for (let i = 0; i < pieces.length; i++) {
        if (pieces[i].indexOf(q) === 0) return true;
      }
      return false;
    });

    if (startsWithWordInNome.length) {
      return startsWithWordInNome
        .sort(function (a, b) {
          return a.label.localeCompare(b.label, 'pt-BR');
        })
        .slice(0, 50);
    }

    return [];
  }, [all, query]);

  if (!props.open) return null;

  return (
    <div onClick={props.onCancel} style={stylesModal.overlay}>
      <div
        onClick={function (e) {
          e.stopPropagation();
        }}
        style={{ ...stylesModal.boxLarge }}
      >
        <div style={stylesModal.header}>
          <div style={stylesModal.title}>Mora/Vota em outra cidade</div>
          <div style={stylesModal.sub}>Digite o começo do nome da cidade ou escolha NQ Responder</div>
        </div>

        <div style={{ padding: 12 }}>
          {loadErr ? (
            <div
              style={{
                marginBottom: 10,
                padding: 10,
                border: '1px solid ' + COLORS.danger,
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              ❌ {loadErr}
            </div>
          ) : null}

          <input
            value={query}
            onChange={function (e) {
              const v = e.target.value;
              setQuery(v);
              setSelected(v);
            }}
            placeholder={loading ? 'Carregando lista do IBGE...' : 'Digite a cidade (ex: Santos, São Paulo, Mauá)'}
            style={stylesModal.textInput}
            disabled={loading || !!loadErr}
            autoFocus
          />

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={function () {
                setQuery('');
                setSelected('NQ_RESPONDER');
              }}
              style={{
                ...styles.btn,
                background: selected === 'NQ_RESPONDER' ? 'rgba(249,115,22,.14)' : COLORS.surface,
              }}
            >
              NQ Responder
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              border: '1px solid ' + COLORS.border,
              borderRadius: 12,
              background: COLORS.surface,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {loading ? (
              <div style={{ padding: 12, fontSize: 13, color: COLORS.textMuted }}>Carregando cidades...</div>
            ) : options.length ? (
              options.map(function (c) {
                const active = selected === c.label;
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={function () {
                      setQuery(c.label);
                      setSelected(c.label);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid ' + COLORS.border,
                      background: active ? 'rgba(249,115,22,.14)' : COLORS.surface,
                      color: COLORS.text,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: active ? 900 : 700,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })
            ) : (
              <div style={{ padding: 12, fontSize: 13, color: COLORS.textMuted }}>Nenhuma cidade encontrada.</div>
            )}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: COLORS.textMuted }}>
            {loading
              ? 'Carregando...'
              : all.length
              ? 'Total de cidades: ' + all.length + ' • Mostrando até ' + options.length
              : '—'}
          </div>

          <div style={stylesModal.rowBtns}>
            <button style={styles.btn} onClick={props.onCancel}>
              Cancelar
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={function () {
                if (selected === 'NQ_RESPONDER') {
                  props.onConfirm({ tipo: 'NQ_RESPONDER', city: '' });
                  return;
                }

                const city = String(selected || query || '').trim();
                if (!city) {
                  window.alert('Selecione uma cidade ou NQ Responder.');
                  return;
                }

                props.onConfirm({ tipo: 'MORA_VOTA', city: city });
              }}
              disabled={loading || !!loadErr}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowActionsModal(props: {
  open: boolean;
  row: Row | null;
  onClose: () => void;
  onToggleStatus: (next: Exclude<Status, 'PENDENTE'>) => void;
  onCall: (which: 'TF1' | 'TF2') => void;
  onCopy: (label: string, value: string) => void;
  onOpenRetorno: () => void;
  onOpenOutraCidade: () => void;
  onSetNaoPodeFazerPesquisa: () => void;
}) {
  if (!props.open || !props.row) return null;

  const row = props.row;
  const tf1 = safeTel(row.TF1);
  const tf2 = safeTel(row.TF2);
  const isNaoAtendeuOuCaixa = row.STATUS === 'NAO_ATENDEU' || row.STATUS === 'CAIXA_POSTAL';

  return (
    <div onClick={props.onClose} style={stylesModal.overlay}>
      <div
        onClick={function (e) {
          e.stopPropagation();
        }}
        style={stylesModal.boxXLarge}
      >
        <div style={stylesModal.header}>
          <div style={stylesModal.title}>Ações • IDP {row.IDP}</div>
          <div style={stylesModal.sub}>
            Status atual: <b>{statusText(row)}</b>
          </div>
        </div>

        <div style={{ padding: 12 }}>
          <ActionButton
            active={row.STATUS === 'PESQUISA_FEITA'}
            kind="success"
            onClick={function () {
              props.onToggleStatus('PESQUISA_FEITA');
              props.onClose();
            }}
          >
            Pesquisa Feita
          </ActionButton>

          <ActionButton
            active={isNaoAtendeuOuCaixa}
            kind="warning"
            onClick={function () {
              props.onToggleStatus('NAO_ATENDEU');
              props.onClose();
            }}
          >
            Não atendeu/caixa postal
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'NUMERO_NAO_EXISTE'}
            kind="danger"
            onClick={function () {
              props.onToggleStatus('NUMERO_NAO_EXISTE');
              props.onClose();
            }}
          >
            Nº Não Existe
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'RECUSA'}
            kind="pink"
            onClick={function () {
              props.onToggleStatus('RECUSA');
              props.onClose();
            }}
          >
            Recusa
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'RETORNO'}
            kind="blueDark"
            onClick={function () {
              if (row.STATUS === 'RETORNO') {
                props.onToggleStatus('RETORNO');
                props.onClose();
                return;
              }
              props.onOpenRetorno();
            }}
          >
            Retorno
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'OUTRA_CIDADE'}
            kind="orange"
            onClick={function () {
              props.onOpenOutraCidade();
            }}
          >
            Mora/Vota em outra cidade
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'NAO_PODE_FAZER_PESQUISA'}
            kind="teal"
            onClick={function () {
              props.onSetNaoPodeFazerPesquisa();
              props.onClose();
            }}
          >
            Não pode fazer a pesquisa
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'REMOVER_DA_LISTA'}
            kind="purple"
            onClick={function () {
              props.onToggleStatus('REMOVER_DA_LISTA');
              props.onClose();
            }}
          >
            Remover da lista
          </ActionButton>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid ' + COLORS.border, background: COLORS.surfaceMuted }}>
          <div>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary, marginRight: 8, marginBottom: 8 }}
              onClick={function () {
                props.onCopy('IDP', row.IDP);
              }}
              title="Copiar IDP"
            >
              Copiar IDP 📋
            </button>

            <MiniTel
              label="TF1"
              value={row.TF1}
              disabled={!tf1}
              onClick={function () {
                props.onCall('TF1');
              }}
              onCopy={function () {
                props.onCopy('TF1', row.TF1);
              }}
            />
            <MiniTel
              label="TF2"
              value={row.TF2}
              disabled={!tf2}
              onClick={function () {
                props.onCall('TF2');
              }}
              onCopy={function () {
                props.onCopy('TF2', row.TF2);
              }}
            />

            <div style={{ marginTop: 8 }}>
              <button style={styles.btn} onClick={props.onClose}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniAppTabela() {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [saveTick, setSaveTick] = useState(0);

  const [payload, setPayload] = useState<PartePayload[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [allRows, setAllRows] = useState<Row[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS');
  const [cidadeFilter, setCidadeFilter] = useState<string>('TODAS');
  const [regiaoFilter, setRegiaoFilter] = useState<string>('TODAS');

  const [page, setPage] = useState(1);

  const [toast, setToast] = useState<string>('');

  const [dirty, setDirty] = useState<Record<string, DirtyRow>>({});
  const dirtyCount = useMemo(function () {
    return Object.keys(dirty).length;
  }, [dirty]);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string>('');
  const activeRow = useMemo(function () {
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i].id === activeRowId) return allRows[i];
    }
    return null;
  }, [allRows, activeRowId]);

  const [retornoModalOpen, setRetornoModalOpen] = useState(false);
  const [retornoInitial, setRetornoInitial] = useState<string>('');

  const [outraCidadeModalOpen, setOutraCidadeModalOpen] = useState(false);
  const [outraCidadeInitial, setOutraCidadeInitial] = useState<string>('');

  useEffect(function () {
    const entregaId = getEntregaIdOnly();
    if (!entregaId) {
      setError('Sem entregaId na URL. Abra com: #/?entregaId=SEU_ID');
      return;
    }

    (async function () {
      try {
        setLoading(true);
        setError('');
        setPayload(null);

        const url = API_GET_ENTREGA + '?entregasId=' + encodeURIComponent(entregaId);
        const resp = await requestText(url);
        const raw = await resp.text().catch(function () {
          return '';
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' • ' + (raw || 'Sem body'));
        if (!String(raw || '').trim()) throw new Error('Servidor respondeu vazio (sem JSON).');

        let data: any;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error('Resposta não é JSON. Início: ' + raw.slice(0, 300));
        }

        setPayload(Array.isArray(data) ? data : [data]);
      } catch (e: any) {
        setError(String((e && e.message) || e || 'Erro ao buscar payload'));
        setPayload(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(function () {
    if (!payload || payload.length === 0) return;

    const item = payload[0] as PartePayload;
    const csv = String((item && item.csv) || '');

    if (!csv.trim()) {
      setAllRows([]);
      setError('Payload chegou, mas não veio o CSV.');
      return;
    }

    const rows = csvToRows(csv);
    setAllRows(rows);
    setDirty({});
    setPage(1);
    setError('');
  }, [payload]);

  const geoCols = useMemo(function () {
    let hasEstado = false;
    let hasCidade = false;
    let hasRegiao = false;

    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i];
      if (String(r.ESTADO || '').trim()) hasEstado = true;
      if (String(r.CIDADE || '').trim()) hasCidade = true;
      if (String(r.REGIAO_CIDADE || '').trim()) hasRegiao = true;
    }

    return { estado: hasEstado, cidade: hasCidade, regiao: hasRegiao };
  }, [allRows]);

  const estadosDisponiveis = useMemo(function () {
    if (!geoCols.estado) return [];
    const s: Record<string, boolean> = {};
    const arr: string[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const v = String(allRows[i].ESTADO || '').trim();
      if (v && !s[v]) {
        s[v] = true;
        arr.push(v);
      }
    }

    arr.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return arr;
  }, [allRows, geoCols.estado]);

  const cidadesDisponiveis = useMemo(function () {
    if (!geoCols.cidade) return [];
    const s: Record<string, boolean> = {};
    const arr: string[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const v = String(allRows[i].CIDADE || '').trim();
      if (v && !s[v]) {
        s[v] = true;
        arr.push(v);
      }
    }

    arr.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return arr;
  }, [allRows, geoCols.cidade]);

  const regioesDisponiveis = useMemo(function () {
    if (!geoCols.regiao) return [];
    const s: Record<string, boolean> = {};
    const arr: string[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const v = String(allRows[i].REGIAO_CIDADE || '').trim();
      if (v && !s[v]) {
        s[v] = true;
        arr.push(v);
      }
    }

    arr.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return arr;
  }, [allRows, geoCols.regiao]);

  const filteredRows = useMemo(function () {
    return allRows.filter(function (r) {
      if (geoCols.estado && estadoFilter !== 'TODOS') {
        const vEstado = String(r.ESTADO || '').trim();
        if (vEstado !== estadoFilter) return false;
      }

      if (geoCols.cidade && cidadeFilter !== 'TODAS') {
        const vCidade = String(r.CIDADE || '').trim();
        if (vCidade !== cidadeFilter) return false;
      }

      if (geoCols.regiao && regiaoFilter !== 'TODAS') {
        const vRegiao = String(r.REGIAO_CIDADE || '').trim();
        if (vRegiao !== regiaoFilter) return false;
      }

      if (statusFilter === 'PENDENTES') return r.STATUS === 'PENDENTE';
      if (statusFilter !== 'TODOS') return r.STATUS === statusFilter;

      return true;
    });
  }, [allRows, statusFilter, estadoFilter, cidadeFilter, regiaoFilter, geoCols]);

  useEffect(function () {
    setPage(1);
  }, [statusFilter, estadoFilter, cidadeFilter, regiaoFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  const pageRows = useMemo(function () {
    const from = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(from, from + PAGE_SIZE);
  }, [filteredRows, page]);

  function updateRow(id: string, patch: Partial<Row>) {
    setAllRows(function (prev) {
      return prev.map(function (r) {
        return r.id === id ? { ...r, ...patch } : r;
      });
    });
  }

  function markDirty(
    row: Row,
    patch: {
      STATUS?: Status;
      OBSERVACAO?: string;
      DT_ALTERACAO?: string;
      UPDATED_AT_MS?: number;
    }
  ) {
    const nextStatus = patch.STATUS || row.STATUS;
    const nextObs = patch.OBSERVACAO != null ? patch.OBSERVACAO : row.OBSERVACAO || '';
    const nextDtAlteracao = patch.DT_ALTERACAO || nowLocalStampPreciso();
    const nextUpdatedAtMs = patch.UPDATED_AT_MS || Date.now();

    setDirty(function (prev) {
      const lineKey = String(row.LINE);
      const current = prev[lineKey];

      if (current && current.UPDATED_AT_MS && current.UPDATED_AT_MS > nextUpdatedAtMs) {
        return prev;
      }

      return {
        ...prev,
        [lineKey]: {
          STATUS: nextStatus,
          OBSERVACAO: nextObs,
          DT_ALTERACAO: nextDtAlteracao,
          UPDATED_AT_MS: nextUpdatedAtMs,
        },
      };
    });

    setSaveTick(function (x) {
      return x + 1;
    });
  }

  function applyRowChange(row: Row, nextStatus: Status, nextObs: string) {
    const stamp = nowLocalStampPreciso();
    const updatedAtMs = Date.now();

    updateRow(row.id, {
      STATUS: nextStatus,
      OBSERVACAO: nextObs,
      DT_ALTERACAO: stamp,
    });

    markDirty(row, {
      STATUS: nextStatus,
      OBSERVACAO: nextObs,
      DT_ALTERACAO: stamp,
      UPDATED_AT_MS: updatedAtMs,
    });
  }

  function toggleStatusForRow(row: Row, next: Exclude<Status, 'PENDENTE'>) {
    const newStatus: Status = row.STATUS === next ? 'PENDENTE' : next;
    let nextObs = row.OBSERVACAO;

    if (row.STATUS === 'RETORNO' && newStatus !== 'RETORNO') nextObs = '';
    if (row.STATUS === 'OUTRA_CIDADE' && newStatus !== 'OUTRA_CIDADE') nextObs = '';
    if (newStatus === 'NAO_PODE_FAZER_PESQUISA' && nextObs) nextObs = '';
    if (row.STATUS === 'NAO_PODE_FAZER_PESQUISA' && newStatus !== row.STATUS) nextObs = '';

    applyRowChange(row, newStatus, nextObs);
  }

  function setNaoPodeFazerPesquisaForRow(row: Row) {
    applyRowChange(row, 'NAO_PODE_FAZER_PESQUISA', '');
  }

  function openRowActions(row: Row) {
    setActiveRowId(row.id);
    setActionsOpen(true);
  }

  function openRetornoPicker(row: Row) {
    const current = retornoLabelFromObs(row.OBSERVACAO) || '';
    setRetornoInitial(current);
    setRetornoModalOpen(true);
  }

  function confirmRetorno(hhmm: string) {
    const row = activeRow;
    if (!row) {
      setRetornoModalOpen(false);
      return;
    }

    const cleaned = validateHHMM(hhmm);
    if (!cleaned) {
      window.alert('Digite um horário válido.');
      return;
    }

    applyRowChange(row, 'RETORNO', cleaned);
    setRetornoModalOpen(false);
    setActionsOpen(false);
  }

  function openOutraCidadePicker(row: Row) {
    const current = outraCidadeFromObs(row.OBSERVACAO) || '';
    setOutraCidadeInitial(current);
    setOutraCidadeModalOpen(true);
  }

  function confirmOutraCidade(payload: { tipo: OutraCidadeTipo; city: string }) {
    const row = activeRow;
    if (!row) {
      setOutraCidadeModalOpen(false);
      return;
    }

    const obs =
      payload.tipo === 'NQ_RESPONDER'
        ? buildOutraCidadeObs('NQ_RESPONDER')
        : buildOutraCidadeObs('MORA_VOTA', payload.city);

    applyRowChange(row, 'OUTRA_CIDADE', obs);

    setOutraCidadeModalOpen(false);
    setActionsOpen(false);
  }

  function callPhoneForRow(row: Row, which: 'TF1' | 'TF2') {
    const tel = telToDial(row[which]);
    if (!tel) return;
    window.location.href = 'tel:' + tel;
  }

  async function copyToClipboard(label: string, value: string) {
    const v = String(value || '').trim();
    if (!v) return;

    try {
      if (navigator && (navigator as any).clipboard && (navigator as any).clipboard.writeText) {
        await (navigator as any).clipboard.writeText(v);
      } else {
        await fallbackCopyText(v);
      }

      setToast(label + ' copiado: ' + v);
      setTimeout(function () {
        setToast('');
      }, 3000);
    } catch {
      try {
        await fallbackCopyText(v);
        setToast(label + ' copiado: ' + v);
      } catch {
        setToast('Não foi possível copiar.');
      }
      setTimeout(function () {
        setToast('');
      }, 3000);
    }
  }

  useEffect(function () {
    const entrega_id = getEntregaIdOnly();
    if (!entrega_id) return;

    const keys = Object.keys(dirty);
    if (!keys.length) return;

    const t = setTimeout(async function () {
      const changes: any[] = [];

      for (let i = 0; i < keys.length; i++) {
        const lineStr = keys[i];
        const v = dirty[lineStr];
        if (!v) continue;

        const status = v.STATUS;
        const obsClean = obsToSave(status, v.OBSERVACAO || '');

        changes.push({
          LINE: Number(lineStr),
          STATUS: status,
          OBSERVACAO: obsClean,
          DT_ALTERACAO: v.DT_ALTERACAO,
          UPDATED_AT_MS: v.UPDATED_AT_MS,
          ts: new Date().toISOString(),
        });
      }

      try {
        setSaving(true);
        setSaveError('');

        const resp = await requestText(API_SAVE_PARTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entrega_id: entrega_id, changes: changes }),
        });

        const txt = await resp.text().catch(function () {
          return '';
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' • ' + (txt || 'Sem body'));

        setDirty({});
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch (e: any) {
        setSaveError(String((e && e.message) || e));
      } finally {
        setSaving(false);
      }
    }, 800);

    return function () {
      clearTimeout(t);
    };
  }, [saveTick, dirty]);

  const pendentes = useMemo(function () {
    return filteredRows.filter(function (r) {
      return r.STATUS === 'PENDENTE';
    }).length;
  }, [filteredRows]);

  const tratados = useMemo(function () {
    return filteredRows.filter(function (r) {
      return r.STATUS !== 'PENDENTE';
    }).length;
  }, [filteredRows]);

  const hasData = allRows.length > 0;

  const hintLink = useMemo(function () {
    const origin = getLocationOriginSafe();
    const path = window.location.pathname || '';
    const base = origin + path + '#/?';
    return base + 'entregaId=SEU_ENTREGA_ID';
  }, []);

  function PaginationControls() {
    return (
      <div style={styles.nav}>
        <div style={styles.pill}>
          Página <b>{page}</b>/<b>{Math.max(1, totalPages)}</b>
        </div>
        <button
          style={styles.btn}
          onClick={function () {
            setPage(function (p) {
              return Math.max(1, p - 1);
            });
          }}
          disabled={page <= 1}
        >
          ⬅️
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnPrimary }}
          onClick={function () {
            setPage(function (p) {
              return Math.min(totalPages, p + 1);
            });
          }}
          disabled={page >= totalPages}
        >
          ➡️
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <style>{globalCss}</style>

      <RowActionsModal
        open={actionsOpen}
        row={activeRow}
        onClose={function () {
          setActionsOpen(false);
        }}
        onToggleStatus={function (next) {
          if (activeRow) toggleStatusForRow(activeRow, next);
        }}
        onCall={function (which) {
          if (activeRow) callPhoneForRow(activeRow, which);
        }}
        onCopy={copyToClipboard}
        onOpenRetorno={function () {
          if (activeRow) openRetornoPicker(activeRow);
        }}
        onOpenOutraCidade={function () {
          if (activeRow) openOutraCidadePicker(activeRow);
        }}
        onSetNaoPodeFazerPesquisa={function () {
          if (activeRow) setNaoPodeFazerPesquisaForRow(activeRow);
        }}
      />

      <RetornoModal
        open={retornoModalOpen}
        initialValue={retornoInitial}
        onCancel={function () {
          setRetornoModalOpen(false);
        }}
        onConfirm={confirmRetorno}
      />

      <OutraCidadeModal
        open={outraCidadeModalOpen}
        initialValue={outraCidadeInitial}
        onCancel={function () {
          setOutraCidadeModalOpen(false);
        }}
        onConfirm={confirmOutraCidade}
      />

      {!hasData ? (
        <div style={styles.card}>
          <div style={{ padding: 14, color: COLORS.text }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>{loading ? 'Carregando...' : 'Aguardando dados...'}</div>

            <div style={{ color: COLORS.textMuted, marginTop: 6, fontSize: 12 }}>
              {loading ? 'Buscando o CSV no servidor (n8n → DB).' : 'Abra com entregaId para carregar. Exemplo:'}
            </div>

            {!loading && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  border: '1px solid ' + COLORS.border,
                  borderRadius: 10,
                  fontSize: 12,
                  color: COLORS.textMuted,
                  wordBreak: 'break-all',
                  background: COLORS.surface,
                }}
              >
                {hintLink}
              </div>
            )}

            {error ? (
              <div style={{ marginTop: 10, padding: 10, border: '1px solid ' + COLORS.danger, borderRadius: 10 }}>
                <div style={{ fontWeight: 900 }}>⚠️ Erro</div>
                <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>{error}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div style={styles.topbarLocal}>
            <div style={{ minWidth: 240, marginBottom: 8 }}>
              <div style={styles.h1}>Atendimento</div>

              <div style={styles.sub}>
                Registros: <b>{filteredRows.length}</b> • Tratados: <b>{tratados}</b> • Pendentes: <b>{pendentes}</b>
              </div>

              <div style={{ ...styles.sub, marginTop: 6 }}>
                Salvando:{' '}
                <b style={{ color: saving ? COLORS.warning : COLORS.textMuted }}>{saving ? 'SIM' : 'NÃO'}</b>
                {lastSavedAt ? (
                  <span style={{ marginLeft: 10 }}>
                    Último: <b>{lastSavedAt}</b>
                  </span>
                ) : null}
              </div>

              <div style={{ ...styles.sub, marginTop: 6 }}>
                Alterações pendentes:{' '}
                <b style={{ color: dirtyCount ? COLORS.warning : COLORS.textMuted }}>{dirtyCount}</b>
              </div>

              {saveError ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    border: '1px solid ' + COLORS.danger,
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                >
                  ❌ {saveError}
                </div>
              ) : null}
            </div>

            <div style={styles.filtersRow}>
              <select
                value={statusFilter}
                onChange={function (e) {
                  setStatusFilter(e.target.value as StatusFilter);
                }}
                style={styles.select}
              >
                <option value="TODOS">Status: Todos</option>
                <option value="PENDENTES">Status: Pendentes</option>
                <option value="PESQUISA_FEITA">Status: Pesquisa Feita</option>
                <option value="NAO_ATENDEU">Status: Não atendeu/caixa postal</option>
                <option value="NUMERO_NAO_EXISTE">Status: Nº Não Existe</option>
                <option value="RECUSA">Status: Recusa</option>
                <option value="RETORNO">Status: Retorno</option>
                <option value="OUTRA_CIDADE">Status: Mora/Vota em outra cidade</option>
                <option value="NAO_PODE_FAZER_PESQUISA">Status: Não pode fazer a pesquisa</option>
                <option value="REMOVER_DA_LISTA">Status: Remover da lista</option>
              </select>

              {geoCols.estado ? (
                <select
                  value={estadoFilter}
                  onChange={function (e) {
                    setEstadoFilter(e.target.value);
                  }}
                  style={styles.select}
                >
                  <option value="TODOS">Estado: Todos</option>
                  {estadosDisponiveis.map(function (uf) {
                    return (
                      <option key={uf} value={uf}>
                        Estado: {uf}
                      </option>
                    );
                  })}
                </select>
              ) : null}

              {geoCols.cidade ? (
                <select
                  value={cidadeFilter}
                  onChange={function (e) {
                    setCidadeFilter(e.target.value);
                  }}
                  style={styles.select}
                >
                  <option value="TODAS">Cidade: Todas</option>
                  {cidadesDisponiveis.map(function (c) {
                    return (
                      <option key={c} value={c}>
                        Cidade: {c}
                      </option>
                    );
                  })}
                </select>
              ) : null}

              {geoCols.regiao ? (
                <select
                  value={regiaoFilter}
                  onChange={function (e) {
                    setRegiaoFilter(e.target.value);
                  }}
                  style={styles.select}
                >
                  <option value="TODAS">Região: Todas</option>
                  {regioesDisponiveis.map(function (rg) {
                    return (
                      <option key={rg} value={rg}>
                        Região: {rg}
                      </option>
                    );
                  })}
                </select>
              ) : null}

              <button
                style={styles.btn}
                onClick={function () {
                  setStatusFilter('TODOS');
                  setEstadoFilter('TODOS');
                  setCidadeFilter('TODAS');
                  setRegiaoFilter('TODAS');
                }}
              >
                Limpar filtros
              </button>
            </div>

            <div style={{ marginTop: 8 }}>
              <PaginationControls />
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>Tabela (20 por página)</div>
                <div style={styles.cardSub}>Clique na linha para abrir as ações em um modal.</div>
              </div>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>STATUS</th>
                    <th style={styles.th}>IDP</th>
                    {geoCols.estado ? <th style={styles.th}>ESTADO</th> : null}
                    {geoCols.cidade ? <th style={styles.th}>CIDADE</th> : null}
                    {geoCols.regiao ? <th style={styles.th}>REGIÃO</th> : null}
                    <th style={styles.th}>TF1</th>
                    <th style={styles.th}>TF2</th>
                  </tr>
                </thead>

                <tbody>
                  {pageRows.map(function (r) {
                    const baseBg = rowBg(r.STATUS);
                    const isSelected = actionsOpen && activeRowId === r.id;

                    const selectedBg =
                      r.STATUS === 'OUTRA_CIDADE'
                        ? 'rgba(249,115,22,.42)'
                        : r.STATUS === 'NAO_PODE_FAZER_PESQUISA'
                        ? 'rgba(15,118,110,.34)'
                        : r.STATUS === 'RETORNO'
                        ? 'rgba(30,58,138,.36)'
                        : r.STATUS === 'PESQUISA_FEITA'
                        ? 'rgba(22,163,74,.34)'
                        : r.STATUS === 'NUMERO_NAO_EXISTE'
                        ? 'rgba(239,68,68,.34)'
                        : r.STATUS === 'RECUSA'
                        ? 'rgba(190,24,93,.28)'
                        : r.STATUS === 'NAO_ATENDEU' || r.STATUS === 'CAIXA_POSTAL'
                        ? 'rgba(245,158,11,.40)'
                        : r.STATUS === 'REMOVER_DA_LISTA'
                        ? 'rgba(124,58,237,.30)'
                        : 'rgba(0,0,0,.08)';

                    return (
                      <tr
                        key={r.id}
                        style={{
                          ...styles.tr,
                          background: isSelected ? selectedBg : baseBg,
                          outline: isSelected ? '3px solid rgba(0,0,0,.14)' : '2px solid transparent',
                        }}
                        onClick={function () {
                          openRowActions(r);
                        }}
                      >
                        <td style={styles.td}>
                          <StatusPill row={r} />
                        </td>

                        <td style={styles.td} title="Copiar IDP pelo botão no modal">
                          {r.IDP}
                        </td>

                        {geoCols.estado ? <td style={styles.td}>{r.ESTADO || '—'}</td> : null}
                        {geoCols.cidade ? <td style={styles.td}>{r.CIDADE || '—'}</td> : null}
                        {geoCols.regiao ? <td style={styles.td}>{r.REGIAO_CIDADE || '—'}</td> : null}

                        <td style={styles.td}>{r.TF1 || '—'}</td>
                        <td style={styles.td}>{r.TF2 || '—'}</td>
                      </tr>
                    );
                  })}

                  {pageRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2 + (geoCols.estado ? 1 : 0) + (geoCols.cidade ? 1 : 0) + (geoCols.regiao ? 1 : 0) + 2}
                        style={{
                          padding: 14,
                          color: COLORS.textMuted,
                          fontSize: 13,
                          background: COLORS.surface,
                        }}
                      >
                        Nenhum registro encontrado com esses filtros.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={styles.footerHint}>✅ Clique na linha para abrir o modal de ações.</div>

            <div style={{ padding: 10, borderTop: '1px solid ' + COLORS.border, background: COLORS.surfaceMuted }}>
              <PaginationControls />
            </div>
          </div>
        </>
      )}

      {toast ? <div style={styles.snackbar}>{toast}</div> : null}
    </div>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<MiniAppTabela />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </HashRouter>
    </AppErrorBoundary>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topbarLocal: {
    background: COLORS.surfaceMuted,
    border: '1px solid ' + COLORS.border,
    borderRadius: COLORS.radius,
    boxShadow: COLORS.shadow,
    padding: 10,
    marginBottom: 10,
  },
  h1: { fontWeight: 900, fontSize: 15, color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },

  filtersRow: {
    marginTop: 8,
  },

  select: {
    border: '1px solid ' + COLORS.border,
    background: COLORS.surface,
    color: COLORS.text,
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 13,
    outline: 'none',
    marginRight: 8,
    marginBottom: 8,
  },

  nav: { display: 'block' },
  pill: {
    border: '1px solid ' + COLORS.border,
    background: COLORS.surface,
    color: COLORS.text,
    padding: '8px 10px',
    borderRadius: 999,
    fontSize: 13,
    display: 'inline-block',
    marginRight: 8,
    marginBottom: 8,
    whiteSpace: 'nowrap',
  },

  btn: {
    border: '1px solid ' + COLORS.border,
    background: COLORS.secondary,
    color: COLORS.secondaryText,
    padding: '10px 12px',
    borderRadius: 10,
    fontWeight: 900,
    fontSize: 13,
    cursor: 'pointer',
    marginRight: 8,
    marginBottom: 8,
  },
  btnPrimary: {
    background: COLORS.primary,
    color: COLORS.primaryText,
    borderColor: COLORS.border,
  },

  card: {
    background: COLORS.surface,
    border: '1px solid ' + COLORS.border,
    borderRadius: COLORS.radius,
    overflow: 'hidden',
    boxShadow: COLORS.shadow,
  },
  cardHeader: {
    padding: 10,
    borderBottom: '1px solid ' + COLORS.border,
    background: COLORS.surfaceMuted,
  },
  cardTitle: { fontWeight: 900, fontSize: 14, color: COLORS.text },
  cardSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },

  tableWrap: { overflow: 'auto', background: COLORS.surface },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 860 },
  th: {
    background: COLORS.surfaceMuted,
    borderBottom: '1px solid ' + COLORS.border,
    padding: '10px 12px',
    fontSize: 13,
    textAlign: 'left',
    color: COLORS.textMuted,
    whiteSpace: 'nowrap',
  },
  tr: { cursor: 'pointer' },
  td: {
    borderBottom: '1px solid ' + COLORS.border,
    padding: '11px 12px',
    fontSize: 13,
    color: COLORS.text,
    whiteSpace: 'nowrap',
    userSelect: 'text',
    background: 'transparent',
  },

  footerHint: {
    padding: 10,
    color: COLORS.textMuted,
    fontSize: 13,
    background: COLORS.surface,
  },

  btnAction: {
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnActive: {
    outline: '3px solid rgba(0,0,0,.12)',
  },

  snackbar: {
    position: 'fixed',
    left: '50%',
    bottom: 14,
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,.88)',
    color: '#fff',
    padding: '10px 12px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 900,
    maxWidth: '92vw',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    zIndex: 10000,
    boxShadow: '0 12px 30px rgba(0,0,0,.25)',
  },
};

const stylesModal: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,.35)',
    padding: 14,
    zIndex: 9999,
    overflowY: 'auto',
  },
  box: {
    width: '96%',
    maxWidth: 420,
    margin: '20px auto',
    background: COLORS.surface,
    border: '1px solid ' + COLORS.border,
    borderRadius: 14,
    boxShadow: COLORS.shadow,
    overflow: 'hidden',
  },
  boxLarge: {
    width: '96%',
    maxWidth: 560,
    margin: '20px auto',
    background: COLORS.surface,
    border: '1px solid ' + COLORS.border,
    borderRadius: 14,
    boxShadow: COLORS.shadow,
    overflow: 'hidden',
  },
  boxXLarge: {
    width: '96%',
    maxWidth: 760,
    margin: '20px auto',
    background: COLORS.surface,
    border: '1px solid ' + COLORS.border,
    borderRadius: 14,
    boxShadow: COLORS.shadow,
    overflow: 'hidden',
  },
  header: {
    padding: 12,
    background: COLORS.surfaceMuted,
    borderBottom: '1px solid ' + COLORS.border,
  },
  title: { fontWeight: 900, fontSize: 14, color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  input: {
    width: '100%',
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid ' + COLORS.border,
    background: COLORS.surface2,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 900,
    outline: 'none',
  },
  textInput: {
    width: '100%',
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid ' + COLORS.border,
    background: COLORS.surface2,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 800,
    outline: 'none',
  },
  rowBtns: {
    marginTop: 12,
    textAlign: 'right',
  },
};