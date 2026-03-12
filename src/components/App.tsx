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

const PAGE_SIZE = 20;

const API_GET_ENTREGA = 'https://n8n.srv962474.hstgr.cloud/webhook/entregas';
const API_SAVE_PARTE = 'https://n8n.srv962474.hstgr.cloud/webhook/parte/salvar';

const IBGE_MUNICIPIOS_API = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';

// =========================
// THEME
// =========================
const globalCss = `
:root{
  --bg: #FFFFFF;
  --surface: #FFFFFF;
  --surface-2: #FFFFFF;
  --surfaceMuted: #F3F4F6;
  --text: #000000;
  --text-muted: #374151;
  --border: #D1D5DB;

  --primary: #000000;
  --primary-text: #FFFFFF;

  --secondary: #FFFFFF;
  --secondary-text: #000000;

  --success: #16A34A;
  --warning: #F59E0B;
  --danger:  #EF4444;
  --orange:  #F97316;

  --blueDark: #1E3A8A;
  --blueLight: #38BDF8;

  --purple: #7C3AED;
  --teal: #0F766E;
  --pink: #BE185D;

  --shadow: 0 10px 30px rgba(0,0,0,.10);
  --radius: 15px;
}

html, body{ height: 100%; }

body{
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #FFFFFF 0%, #F3F4F6 100%);
  margin: 0;
  padding: 0;
  color: var(--text);
}
*{ box-sizing: border-box; }
button:disabled{ opacity: .55; cursor: not-allowed !important; }
`;

// =========================
// HELPERS
// =========================
function getEntregaIdOnly(): string {
  const hash = window.location.hash || '';
  const qi = hash.indexOf('?');
  if (qi >= 0) {
    const qs = hash.slice(qi + 1);
    const hp = new URLSearchParams(qs);
    const v = (hp.get('entregaId') || '').trim();
    if (v && v !== 'undefined' && v !== 'null') return v;
  }

  const sp = new URLSearchParams(window.location.search || '');
  const v2 = (sp.get('entregaId') || '').trim();
  if (v2 && v2 !== 'undefined' && v2 !== 'null') return v2;

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
  if (digits.startsWith('0') || digits.startsWith('55')) return digits;
  return `0${digits}`;
}

function nowLocalStampPreciso() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}.${ms}`;
}

function normalizeHeader(h: string) {
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
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
  const s = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');

  if (!s) return 'PENDENTE';

  if (s === 'SEM_RESPOSTA') return 'RETORNO';
  if (s === 'LIGAR_MAIS_TARDE') return 'RETORNO';
  if (s.startsWith('RETORNO')) return 'RETORNO';

  if (s === 'ATENDEU' || s === 'PESQUISA_FEITA') return 'PESQUISA_FEITA';

  if (
    s === 'NAO_ATENDEU' ||
    s === 'NAO_ATENDEU_CAIXA_POSTAL' ||
    s === 'CAIXA_POSTAL'
  ) {
    return 'NAO_ATENDEU';
  }

  if (s === 'OUTRA_CIDADE') return 'OUTRA_CIDADE';

  if (
    s === 'SO_MORA' ||
    s === 'SO_VOTA' ||
    s === 'NAO_PODE_FAZER_PESQUISA'
  ) {
    return 'NAO_PODE_FAZER_PESQUISA';
  }

  if (
    s === 'NUMERO_NAO_EXISTE' ||
    s === 'NUMERO_INEXISTENTE'
  ) {
    return 'NUMERO_NAO_EXISTE';
  }

  if (
    s === 'REMOVER_DA_LISTA' ||
    s === 'REMOVER_LISTA'
  ) {
    return 'REMOVER_DA_LISTA';
  }

  if (s === 'RECUSA') return 'RECUSA';

  if (s === 'PENDENTE') return 'PENDENTE';

  return 'PENDENTE';
}

// =========================
// OUTRA CIDADE HELPERS
// =========================
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

  return t ? `MORA/VOTA EM OUTRA CIDADE • ${t}` : 'MORA/VOTA EM OUTRA CIDADE';
}

function obsToSave(status: Status, obs: string) {
  const t = String(obs || '').trim();

  if (status === 'OUTRA_CIDADE') {
    return t;
  }

  if (status === 'RETORNO') {
    const hhmm = retornoLabelFromObs(t) || t.replace(/^RETORNO\s*[-–—]?\s*/i, '').trim();
    return hhmm;
  }

  if (status === 'NAO_PODE_FAZER_PESQUISA') {
    return '';
  }

  return t;
}

function parseCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = String(csv || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return { headers: [], rows: [] };

  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const next = text[i + 1];
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

  const splitLine = (line: string) => {
    const out: string[] = [];
    let c = '';
    let q = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        const next = line[i + 1];
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
    return out.map((x) => x.trim());
  };

  const headers = splitLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());

  const rows = lines.slice(1).map((ln) => {
    const cols = splitLine(ln);
    const obj: Record<string, string> = {};

    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? '').replace(/^"|"$/g, '');
    });

    return obj;
  });

  return { headers, rows };
}

function pickCanonicalValue(obj: Record<string, string>, headers: string[], familyKey: string) {
  const matchingHeaders = headers.filter((h) => canonicalHeaderKey(h) === familyKey);

  if (!matchingHeaders.length) return '';

  const values = matchingHeaders
    .map((realHeader) => String(obj[realHeader] ?? '').trim());

  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i]) return values[i];
  }

  return values[values.length - 1] || '';
}

function csvToRows(csv: string): Row[] {
  const { headers, rows } = parseCsv(csv);
  if (!rows.length) return [];

  return rows.map((r, idx) => {
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

    return {
      id: `row-${idx + 1}`,
      LINE: Number.isFinite(lineNum) && lineNum > 0 ? lineNum : idx + 1,
      IDP: String(IDP || ''),
      ESTADO: String(ESTADO || ''),
      CIDADE: String(CIDADE || ''),
      REGIAO_CIDADE: String(REGIAO_CIDADE || ''),
      TF1: String(TF1 || ''),
      TF2: String(TF2 || ''),
      STATUS: sanitizeStatus(statusCsv),
      OBSERVACAO: String(obsCsv || ''),
      DT_ALTERACAO: String(dtAlteracaoCsv || ''),
    };
  });
}

function retornoLabelFromObs(obs: string) {
  const t = String(obs || '').trim();

  if (/^\d{1,2}:\d{2}$/.test(t)) return t;

  const m = t.match(/RETORNO\s*[-–—]?\s*(\d{1,2}:\d{2})/i);
  return m?.[1] || '';
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
    return hhmm ? `RETORNO • ${hhmm}` : 'RETORNO';
  }

  if (s === 'REMOVER_DA_LISTA') return 'REMOVER DA LISTA';

  return 'PENDENTE';
}

function statusVars(s: Status) {
  switch (s) {
    case 'PESQUISA_FEITA':
      return { bd: 'var(--success)', bg: 'rgba(22,163,74,.32)' };
    case 'OUTRA_CIDADE':
      return { bd: 'var(--orange)', bg: 'rgba(249,115,22,.34)' };
    case 'NAO_PODE_FAZER_PESQUISA':
      return { bd: 'var(--teal)', bg: 'rgba(15,118,110,.28)' };
    case 'RETORNO':
      return { bd: 'var(--blueDark)', bg: 'rgba(30,58,138,.30)' };
    case 'NUMERO_NAO_EXISTE':
      return { bd: 'var(--danger)', bg: 'rgba(239,68,68,.34)' };
    case 'RECUSA':
      return { bd: 'var(--pink)', bg: 'rgba(190,24,93,.22)' };
    case 'NAO_ATENDEU':
    case 'CAIXA_POSTAL':
      return { bd: 'var(--warning)', bg: 'rgba(245,158,11,.34)' };
    case 'REMOVER_DA_LISTA':
      return { bd: 'var(--purple)', bg: 'rgba(124,58,237,.24)' };
    default:
      return { bd: 'var(--border)', bg: 'rgba(0,0,0,.06)' };
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

// =========================
// UI
// =========================
function StatusPill({ row }: { row: Row }) {
  const c = statusVars(row.STATUS);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 999,
        border: `2px solid ${c.bd}`,
        background: c.bg,
        fontWeight: 900,
        fontSize: 11,
        color: 'var(--text)',
        whiteSpace: 'nowrap',
      }}
    >
      {statusText(row)}
    </span>
  );
}

function ActionButton({
  active,
  kind,
  children,
  onClick,
}: {
  active: boolean;
  kind: 'danger' | 'warning' | 'success' | 'blueDark' | 'blueLight' | 'orange' | 'purple' | 'teal' | 'pink';
  children: React.ReactNode;
  onClick: () => void;
}) {
  const base =
    kind === 'danger'
      ? { border: '2px solid rgba(239,68,68,.70)', background: 'rgba(239,68,68,.28)', color: 'var(--text)' }
      : kind === 'orange'
        ? { border: '2px solid rgba(249,115,22,.70)', background: 'rgba(249,115,22,.28)', color: 'var(--text)' }
        : kind === 'warning'
          ? { border: '2px solid rgba(245,158,11,.70)', background: 'rgba(245,158,11,.28)', color: 'var(--text)' }
          : kind === 'blueDark'
            ? { border: '2px solid rgba(30,58,138,.65)', background: 'rgba(30,58,138,.24)', color: 'var(--text)' }
            : kind === 'blueLight'
              ? { border: '2px solid rgba(56,189,248,.65)', background: 'rgba(56,189,248,.22)', color: 'var(--text)' }
              : kind === 'purple'
                ? { border: '2px solid rgba(124,58,237,.65)', background: 'rgba(124,58,237,.22)', color: 'var(--text)' }
                : kind === 'teal'
                  ? { border: '2px solid rgba(15,118,110,.65)', background: 'rgba(15,118,110,.18)', color: 'var(--text)' }
                  : kind === 'pink'
                    ? { border: '2px solid rgba(190,24,93,.65)', background: 'rgba(190,24,93,.16)', color: 'var(--text)' }
                    : { border: '2px solid rgba(22,163,74,.65)', background: 'rgba(22,163,74,.24)', color: 'var(--text)' };

  return (
    <button
      onClick={onClick}
      style={{
        ...styles.btnAction,
        ...base,
        ...(active ? styles.btnActive : {}),
      }}
    >
      {children}
    </button>
  );
}

function MiniTel({
  label,
  value,
  disabled,
  onClick,
  onCopy,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onClick: () => void;
  onCopy: () => void;
}) {
  const enabled = !disabled;

  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button
        disabled={!enabled}
        onClick={onClick}
        style={{
          ...styles.btn,
          ...styles.btnPrimary,
          background: enabled ? 'var(--primary)' : 'var(--surfaceMuted)',
          color: enabled ? 'var(--primary-text)' : 'var(--text-muted)',
          borderColor: 'var(--border)',
          padding: '9px 12px',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 900,
          cursor: enabled ? 'pointer' : 'not-allowed',
          whiteSpace: 'nowrap',
        }}
        title={value || ''}
      >
        {`Ligar ${label} 📞`}
      </button>

      <button
        disabled={!value}
        onClick={onCopy}
        style={{
          ...styles.btn,
          ...styles.btnPrimary,
          background: value ? 'var(--primary)' : 'var(--surfaceMuted)',
          color: value ? 'var(--primary-text)' : 'var(--text-muted)',
          borderColor: 'var(--border)',
          padding: '9px 12px',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 900,
          cursor: value ? 'pointer' : 'not-allowed',
          whiteSpace: 'nowrap',
        }}
        title={value ? `Copiar ${label}` : ''}
      >
        {`Copiar ${label}`}
      </button>
    </div>
  );
}

// =========================
// MODAL: Retorno (time)
// =========================
function RetornoModal({
  open,
  initialValue,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (hhmm: string) => void;
}) {
  const [value, setValue] = useState(initialValue || '');

  useEffect(() => {
    setValue(initialValue || '');
  }, [initialValue, open]);

  if (!open) return null;

  return (
    <div onClick={onCancel} style={stylesModal.overlay}>
      <div onClick={(e) => e.stopPropagation()} style={stylesModal.box}>
        <div style={stylesModal.header}>
          <div style={stylesModal.title}>⏰ Agendar retorno</div>
          <div style={stylesModal.sub}>Selecione a hora e o minuto</div>
        </div>

        <div style={{ padding: 12 }}>
          <input
            type="time"
            step={60}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={stylesModal.input}
          />

          <div style={stylesModal.rowBtns}>
            <button style={styles.btn} onClick={onCancel}>
              Cancelar
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => {
                const cleaned = String(value || '').trim();
                if (!cleaned || !/^\d{2}:\d{2}$/.test(cleaned)) {
                  window.alert('Selecione um horário válido.');
                  return;
                }
                onConfirm(cleaned);
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

// =========================
// MODAL: Outra cidade
// =========================
type IbgeMunicipio = {
  id: number;
  nome: string;
  microrregiao?: {
    mesorregiao?: {
      UF?: { sigla?: string; nome?: string };
    };
  };
};

function getUfNomeFromMunicipio(m: IbgeMunicipio) {
  return m?.microrregiao?.mesorregiao?.UF?.nome || m?.microrregiao?.mesorregiao?.UF?.sigla || '';
}

function cityLabel(nome: string, estadoNome: string) {
  const n = String(nome || '').trim();
  const e = String(estadoNome || '').trim();
  if (!n) return '';
  return e ? `${n}/${e}` : n;
}

function OutraCidadeModal({
  open,
  initialValue,
  onCancel,
  onConfirm,
}: {
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
    if (!open) return;

    setLoadErr('');
    setQuery(initialValue || '');
    setSelected(initialValue || '');

    if (all.length) return;

    (async () => {
      try {
        setLoading(true);
        setLoadErr('');
        const resp = await fetch(IBGE_MUNICIPIOS_API, { cache: 'force-cache' });
        const raw = await resp.text().catch(() => '');
        if (!resp.ok) throw new Error(`HTTP ${resp.status} • ${raw || 'Sem body'}`);

        let data: any;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error('Resposta do IBGE não é JSON.');
        }

        const list: IbgeMunicipio[] = Array.isArray(data) ? data : [];
        const mapped = list
          .map((m) => {
            const estado = getUfNomeFromMunicipio(m);
            const nome = String(m?.nome || '').trim();
            const label = cityLabel(nome, estado);
            return { label, nome, estado };
          })
          .filter((x) => x.label)
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

        setAll(mapped);
      } catch (e: any) {
        setLoadErr(String(e?.message || e || 'Erro ao carregar cidades do IBGE'));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, initialValue, all.length]);

  const options = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();

    if (!all.length) return [];

    if (!q) return all.slice(0, 50);

    const startsWithNome = all.filter((c) =>
      String(c.nome || '').trim().toLowerCase().startsWith(q)
    );

    if (startsWithNome.length) {
      return startsWithNome
        .sort((a, b) => {
          const aNome = a.nome.toLowerCase();
          const bNome = b.nome.toLowerCase();

          if (aNome === q && bNome !== q) return -1;
          if (bNome === q && aNome !== q) return 1;

          return a.label.localeCompare(b.label, 'pt-BR');
        })
        .slice(0, 50);
    }

    const startsWithWordInNome = all.filter((c) =>
      String(c.nome || '')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .some((part) => part.startsWith(q))
    );

    if (startsWithWordInNome.length) {
      return startsWithWordInNome
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
        .slice(0, 50);
    }

    return [];
  }, [all, query]);

  if (!open) return null;

  return (
    <div onClick={onCancel} style={stylesModal.overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...stylesModal.box, width: 'min(560px, 96vw)' }}>
        <div style={stylesModal.header}>
          <div style={stylesModal.title}> Mora/Vota em outra cidade</div>
          <div style={stylesModal.sub}>Digite o começo do nome da cidade ou escolha NQ Responder</div>
        </div>

        <div style={{ padding: 12 }}>
          {loadErr ? (
            <div
              style={{
                marginBottom: 10,
                padding: 10,
                border: '1px solid var(--danger)',
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              ❌ {loadErr}
            </div>
          ) : null}

          <input
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setSelected(v);
            }}
            placeholder={loading ? 'Carregando lista do IBGE…' : 'Digite a cidade (ex: Santos, São Paulo, Mauá)'}
            style={stylesModal.textInput}
            disabled={loading || !!loadErr}
            autoFocus
          />

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelected('NQ_RESPONDER');
              }}
              style={{
                ...styles.btn,
                background: selected === 'NQ_RESPONDER' ? 'rgba(249,115,22,.14)' : 'var(--surface)',
              }}
            >
              NQ Responder
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface)',
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {loading ? (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>Carregando cidades…</div>
            ) : options.length ? (
              options.map((c) => {
                const active = selected === c.label;
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => {
                      setQuery(c.label);
                      setSelected(c.label);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      background: active ? 'rgba(249,115,22,.14)' : 'var(--surface)',
                      color: 'var(--text)',
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
              <div style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                Nenhuma cidade encontrada.
              </div>
            )}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            {loading
              ? 'Carregando…'
              : all.length
                ? `Total de cidades: ${all.length} • Mostrando até ${options.length}`
                : '—'}
          </div>

          <div style={stylesModal.rowBtns}>
            <button style={styles.btn} onClick={onCancel}>
              Cancelar
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => {
                if (selected === 'NQ_RESPONDER') {
                  onConfirm({ tipo: 'NQ_RESPONDER', city: '' });
                  return;
                }

                const city = String(selected || query || '').trim();
                if (!city) {
                  window.alert('Selecione uma cidade ou NQ Responder.');
                  return;
                }

                onConfirm({ tipo: 'MORA_VOTA', city });
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

// =========================
// MODAL: Ações da linha
// =========================
function RowActionsModal({
  open,
  row,
  onClose,
  onToggleStatus,
  onCall,
  onCopy,
  onOpenRetorno,
  onOpenOutraCidade,
  onSetNaoPodeFazerPesquisa,
}: {
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
  if (!open || !row) return null;

  const tf1 = safeTel(row.TF1);
  const tf2 = safeTel(row.TF2);

  const isNaoAtendeuOuCaixa = row.STATUS === 'NAO_ATENDEU' || row.STATUS === 'CAIXA_POSTAL';

  return (
    <div onClick={onClose} style={stylesModal.overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...stylesModal.box, width: 'min(760px, 96vw)' }}>
        <div style={stylesModal.header}>
          <div style={stylesModal.title}>Ações • IDP {row.IDP}</div>
          <div style={stylesModal.sub}>
            Status atual: <b>{statusText(row)}</b>
          </div>
        </div>

        <div style={{ padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <ActionButton
            active={row.STATUS === 'PESQUISA_FEITA'}
            kind="success"
            onClick={() => {
              onToggleStatus('PESQUISA_FEITA');
              onClose();
            }}
          >
            Pesquisa Feita
          </ActionButton>

          <ActionButton
            active={isNaoAtendeuOuCaixa}
            kind="warning"
            onClick={() => {
              onToggleStatus('NAO_ATENDEU');
              onClose();
            }}
          >
            Não atendeu/caixa postal
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'NUMERO_NAO_EXISTE'}
            kind="danger"
            onClick={() => {
              onToggleStatus('NUMERO_NAO_EXISTE');
              onClose();
            }}
          >
            Nº Não Existe
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'RECUSA'}
            kind="pink"
            onClick={() => {
              onToggleStatus('RECUSA');
              onClose();
            }}
          >
            Recusa
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'RETORNO'}
            kind="blueDark"
            onClick={() => {
              if (row.STATUS === 'RETORNO') {
                onToggleStatus('RETORNO');
                onClose();
                return;
              }
              onOpenRetorno();
            }}
          >
            Retorno
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'OUTRA_CIDADE'}
            kind="orange"
            onClick={() => {
              onOpenOutraCidade();
            }}
          >
            Mora/Vota em outra cidade
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'NAO_PODE_FAZER_PESQUISA'}
            kind="teal"
            onClick={() => {
              onSetNaoPodeFazerPesquisa();
              onClose();
            }}
          >
            Não pode fazer a pesquisa
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'REMOVER_DA_LISTA'}
            kind="purple"
            onClick={() => {
              onToggleStatus('REMOVER_DA_LISTA');
              onClose();
            }}
          >
            Remover da lista
          </ActionButton>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--surfaceMuted)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                style={{ ...styles.btn, ...styles.btnPrimary }}
                onClick={() => onCopy('IDP', row.IDP)}
                title="Copiar IDP"
              >
                Copiar IDP 📋
              </button>

              <MiniTel label="TF1" value={row.TF1} disabled={!tf1} onClick={() => onCall('TF1')} onCopy={() => onCopy('TF1', row.TF1)} />
              <MiniTel label="TF2" value={row.TF2} disabled={!tf2} onClick={() => onCall('TF2')} onCopy={() => onCopy('TF2', row.TF2)} />
            </div>

            <button style={styles.btn} onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================
// MAIN PAGE
// =========================
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
  const dirtyCount = useMemo(() => Object.keys(dirty).length, [dirty]);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string>('');
  const activeRow = useMemo(() => allRows.find((r) => r.id === activeRowId) || null, [allRows, activeRowId]);

  const [retornoModalOpen, setRetornoModalOpen] = useState(false);
  const [retornoInitial, setRetornoInitial] = useState<string>('');

  const [outraCidadeModalOpen, setOutraCidadeModalOpen] = useState(false);
  const [outraCidadeInitial, setOutraCidadeInitial] = useState<string>('');

  useEffect(() => {
    const entregaId = getEntregaIdOnly();
    if (!entregaId) {
      setError('Sem entregaId na URL. Abra com: #/?entregaId=SEU_ID');
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError('');
        setPayload(null);

        const url = `${API_GET_ENTREGA}?entregasId=${encodeURIComponent(entregaId)}`;
        const resp = await fetch(url, { cache: 'no-store' });

        const raw = await resp.text().catch(() => '');
        if (!resp.ok) throw new Error(`HTTP ${resp.status} • ${raw || 'Sem body'}`);
        if (!raw.trim()) throw new Error('Servidor respondeu vazio (sem JSON).');

        let data: any;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(`Resposta não é JSON. Início: ${raw.slice(0, 300)}`);
        }

        setPayload(Array.isArray(data) ? data : [data]);
      } catch (e: any) {
        setError(String(e?.message || e || 'Erro ao buscar payload'));
        setPayload(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!payload || payload.length === 0) return;

    const item = payload[0] as PartePayload;
    const csv = String(item?.csv || '');

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

  const geoCols = useMemo(() => {
    const hasEstado = allRows.some((r) => String(r.ESTADO || '').trim().length > 0);
    const hasCidade = allRows.some((r) => String(r.CIDADE || '').trim().length > 0);
    const hasRegiao = allRows.some((r) => String(r.REGIAO_CIDADE || '').trim().length > 0);
    return { estado: hasEstado, cidade: hasCidade, regiao: hasRegiao };
  }, [allRows]);

  const estadosDisponiveis = useMemo(() => {
    if (!geoCols.estado) return [];
    const s = new Set<string>();
    for (const r of allRows) {
      const v = String(r.ESTADO || '').trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allRows, geoCols.estado]);

  const cidadesDisponiveis = useMemo(() => {
    if (!geoCols.cidade) return [];
    const s = new Set<string>();
    for (const r of allRows) {
      const v = String(r.CIDADE || '').trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allRows, geoCols.cidade]);

  const regioesDisponiveis = useMemo(() => {
    if (!geoCols.regiao) return [];
    const s = new Set<string>();
    for (const r of allRows) {
      const v = String(r.REGIAO_CIDADE || '').trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allRows, geoCols.regiao]);

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (geoCols.estado && estadoFilter !== 'TODOS') {
        const v = String(r.ESTADO || '').trim();
        if (v !== estadoFilter) return false;
      }
      if (geoCols.cidade && cidadeFilter !== 'TODAS') {
        const v = String(r.CIDADE || '').trim();
        if (v !== cidadeFilter) return false;
      }
      if (geoCols.regiao && regiaoFilter !== 'TODAS') {
        const v = String(r.REGIAO_CIDADE || '').trim();
        if (v !== regiaoFilter) return false;
      }

      if (statusFilter === 'PENDENTES') return r.STATUS === 'PENDENTE';
      if (statusFilter !== 'TODOS') return r.STATUS === statusFilter;

      return true;
    });
  }, [allRows, statusFilter, estadoFilter, cidadeFilter, regiaoFilter, geoCols]);

  useEffect(() => setPage(1), [statusFilter, estadoFilter, cidadeFilter, regiaoFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(from, from + PAGE_SIZE);
  }, [filteredRows, page]);

  function updateRow(id: string, patch: Partial<Row>) {
    setAllRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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
    const nextStatus = patch.STATUS ?? row.STATUS;
    const nextObs = patch.OBSERVACAO ?? row.OBSERVACAO ?? '';
    const nextDtAlteracao = patch.DT_ALTERACAO ?? nowLocalStampPreciso();
    const nextUpdatedAtMs = patch.UPDATED_AT_MS ?? Date.now();

    setDirty((prev) => {
      const current = prev[String(row.LINE)];

      if (current?.UPDATED_AT_MS && current.UPDATED_AT_MS > nextUpdatedAtMs) {
        return prev;
      }

      return {
        ...prev,
        [String(row.LINE)]: {
          STATUS: nextStatus,
          OBSERVACAO: nextObs,
          DT_ALTERACAO: nextDtAlteracao,
          UPDATED_AT_MS: nextUpdatedAtMs,
        },
      };
    });

    setSaveTick((x) => x + 1);
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

    const cleaned = String(hhmm || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(cleaned)) {
      window.alert('Selecione um horário válido.');
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
    window.location.href = `tel:${tel}`;
  }

  async function copyToClipboard(label: string, value: string) {
    const v = String(value || '').trim();
    if (!v) return;

    try {
      await navigator.clipboard.writeText(v);
      setToast(`${label} copiado: ${v}`);
      setTimeout(() => setToast(''), 3000);
    } catch {
      setToast('Não foi possível copiar.');
      setTimeout(() => setToast(''), 3000);
    }
  }

  useEffect(() => {
    const entrega_id = getEntregaIdOnly();
    if (!entrega_id) return;

    const entries = Object.entries(dirty);
    if (!entries.length) return;

    const t = setTimeout(async () => {
      const changes = entries.map(([lineStr, v]) => {
        const status = v.STATUS;
        const obsClean = obsToSave(status, v.OBSERVACAO || '');

        return {
          LINE: Number(lineStr),
          STATUS: status,
          OBSERVACAO: obsClean,
          DT_ALTERACAO: v.DT_ALTERACAO,
          UPDATED_AT_MS: v.UPDATED_AT_MS,
          ts: new Date().toISOString(),
        };
      });

      try {
        setSaving(true);
        setSaveError('');

        const resp = await fetch(API_SAVE_PARTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ entrega_id, changes }),
        });

        const txt = await resp.text().catch(() => '');
        if (!resp.ok) throw new Error(`HTTP ${resp.status} • ${txt || 'Sem body'}`);

        setDirty({});
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch (e: any) {
        setSaveError(String(e?.message || e));
      } finally {
        setSaving(false);
      }
    }, 800);

    return () => clearTimeout(t);
  }, [saveTick, dirty]);

  const pendentes = useMemo(() => filteredRows.filter((r) => r.STATUS === 'PENDENTE').length, [filteredRows]);
  const tratados = useMemo(() => filteredRows.filter((r) => r.STATUS !== 'PENDENTE').length, [filteredRows]);
  const hasData = allRows.length > 0;

  const hintLink = useMemo(() => {
    const base = `${window.location.origin}${window.location.pathname}#/?`;
    return `${base}entregaId=SEU_ENTREGA_ID`;
  }, []);

  function PaginationControls() {
    return (
      <div style={styles.nav}>
        <div style={styles.pill}>
          Página <b>{page}</b>/<b>{Math.max(1, totalPages)}</b>
        </div>
        <button style={styles.btn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          ⬅️
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnPrimary }}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
        onClose={() => setActionsOpen(false)}
        onToggleStatus={(next) => activeRow && toggleStatusForRow(activeRow, next)}
        onCall={(which) => activeRow && callPhoneForRow(activeRow, which)}
        onCopy={copyToClipboard}
        onOpenRetorno={() => activeRow && openRetornoPicker(activeRow)}
        onOpenOutraCidade={() => activeRow && openOutraCidadePicker(activeRow)}
        onSetNaoPodeFazerPesquisa={() => activeRow && setNaoPodeFazerPesquisaForRow(activeRow)}
      />

      <RetornoModal open={retornoModalOpen} initialValue={retornoInitial} onCancel={() => setRetornoModalOpen(false)} onConfirm={confirmRetorno} />

      <OutraCidadeModal
        open={outraCidadeModalOpen}
        initialValue={outraCidadeInitial}
        onCancel={() => setOutraCidadeModalOpen(false)}
        onConfirm={confirmOutraCidade}
      />

      {!hasData ? (
        <div style={styles.card}>
          <div style={{ padding: 14, color: 'var(--text)' }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>{loading ? 'Carregando…' : 'Aguardando dados…'}</div>

            <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 12 }}>
              {loading ? 'Buscando o CSV no servidor (n8n → DB).' : 'Abra com entregaId para carregar. Exemplo:'}
            </div>

            {!loading && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  wordBreak: 'break-all',
                  background: 'var(--surface)',
                }}
              >
                {hintLink}
              </div>
            )}

            {error ? (
              <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--danger)', borderRadius: 10 }}>
                <div style={{ fontWeight: 900 }}>⚠️ Erro</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{error}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div style={styles.topbarLocal}>
            <div style={{ minWidth: 240 }}>
              <div style={styles.h1}>Atendimento</div>

              <div style={styles.sub}>
                Registros: <b>{filteredRows.length}</b> • Tratados: <b>{tratados}</b> • Pendentes: <b>{pendentes}</b>
              </div>

              <div style={{ ...styles.sub, marginTop: 6 }}>
                Salvando: <b style={{ color: saving ? 'var(--warning)' : 'var(--text-muted)' }}>{saving ? 'SIM' : 'NÃO'}</b>
                {lastSavedAt && (
                  <span style={{ marginLeft: 10 }}>
                    Último: <b>{lastSavedAt}</b>
                  </span>
                )}
              </div>

              <div style={{ ...styles.sub, marginTop: 6 }}>
                Alterações pendentes: <b style={{ color: dirtyCount ? 'var(--warning)' : 'var(--text-muted)' }}>{dirtyCount}</b>
              </div>

              {saveError && (
                <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--danger)', borderRadius: 10, fontSize: 12 }}>
                  ❌ {saveError}
                </div>
              )}
            </div>

            <div style={styles.filtersRow}>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={styles.select}>
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
                <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} style={styles.select}>
                  <option value="TODOS">Estado: Todos</option>
                  {estadosDisponiveis.map((uf) => (
                    <option key={uf} value={uf}>
                      Estado: {uf}
                    </option>
                  ))}
                </select>
              ) : null}

              {geoCols.cidade ? (
                <select value={cidadeFilter} onChange={(e) => setCidadeFilter(e.target.value)} style={styles.select}>
                  <option value="TODAS">Cidade: Todas</option>
                  {cidadesDisponiveis.map((c) => (
                    <option key={c} value={c}>
                      Cidade: {c}
                    </option>
                  ))}
                </select>
              ) : null}

              {geoCols.regiao ? (
                <select value={regiaoFilter} onChange={(e) => setRegiaoFilter(e.target.value)} style={styles.select}>
                  <option value="TODAS">Região: Todas</option>
                  {regioesDisponiveis.map((rg) => (
                    <option key={rg} value={rg}>
                      Região: {rg}
                    </option>
                  ))}
                </select>
              ) : null}

              <button
                style={styles.btn}
                onClick={() => {
                  setStatusFilter('TODOS');
                  setEstadoFilter('TODOS');
                  setCidadeFilter('TODAS');
                  setRegiaoFilter('TODAS');
                }}
              >
                Limpar filtros
              </button>
            </div>

            <PaginationControls />
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
                  {pageRows.map((r) => {
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
                        onClick={() => openRowActions(r)}
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
                        style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13, background: 'var(--surface)' }}
                      >
                        Nenhum registro encontrado com esses filtros.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={styles.footerHint}>✅ Clique na linha para abrir o modal de ações.</div>

            <div style={{ padding: 10, borderTop: '1px solid var(--border)', background: 'var(--surfaceMuted)' }}>
              <PaginationControls />
            </div>
          </div>
        </>
      )}

      {toast ? <div style={styles.snackbar}>{toast}</div> : null}
    </div>
  );
}

// =========================
// APP ROOT
// =========================
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MiniAppTabela />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
}

// =========================
// STYLES
// =========================
const styles: Record<string, React.CSSProperties> = {
  topbarLocal: {
    background: 'var(--surfaceMuted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: 10,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  h1: { fontWeight: 900, fontSize: 15, color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },

  filtersRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    maxWidth: 900,
  },

  select: {
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 13,
    outline: 'none',
  },

  nav: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  pill: {
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    padding: '8px 10px',
    borderRadius: 999,
    fontSize: 13,
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },

  btn: {
    border: '1px solid var(--border)',
    background: 'var(--secondary)',
    color: 'var(--secondary-text)',
    padding: '10px 12px',
    borderRadius: 10,
    fontWeight: 900,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnPrimary: {
    background: 'var(--primary)',
    color: 'var(--primary-text)',
    borderColor: 'var(--border)',
  },

  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow)',
  },
  cardHeader: {
    padding: 10,
    borderBottom: '1px solid var(--border)',
    background: 'var(--surfaceMuted)',
  },
  cardTitle: { fontWeight: 900, fontSize: 14, color: 'var(--text)' },
  cardSub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },

  tableWrap: { overflow: 'auto', background: 'var(--surface)' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 860 },
  th: {
    position: 'sticky',
    top: 0,
    background: 'var(--surfaceMuted)',
    borderBottom: '1px solid var(--border)',
    padding: '10px 12px',
    fontSize: 13,
    textAlign: 'left',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  tr: { cursor: 'pointer' },
  td: {
    borderBottom: '1px solid var(--border)',
    padding: '11px 12px',
    fontSize: 13,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    userSelect: 'text',
    background: 'transparent',
  },

  footerHint: {
    padding: 10,
    color: 'var(--text-muted)',
    fontSize: 13,
    background: 'var(--surface)',
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
    inset: 0,
    background: 'rgba(0,0,0,.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    zIndex: 9999,
  },
  box: {
    width: 'min(420px, 96vw)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    boxShadow: 'var(--shadow)',
    overflow: 'hidden',
  },
  header: {
    padding: 12,
    background: 'var(--surfaceMuted)',
    borderBottom: '1px solid var(--border)',
  },
  title: { fontWeight: 900, fontSize: 14, color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
  input: {
    width: '100%',
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    fontSize: 16,
    fontWeight: 900,
    outline: 'none',
  },
  textInput: {
    width: '100%',
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    fontSize: 14,
    fontWeight: 800,
    outline: 'none',
  },
  rowBtns: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
};