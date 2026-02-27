// App.tsx (arquivo completo)
// ✅ Mudanças novas aplicadas agora:
// 1) Removido "CONCLUIDOS" de tudo (não existe mais esse status/filtro/texto).
// 2) Ao selecionar um status (ATENDEU / NÃO ATENDEU / NÚMERO NÃO EXISTE / toggles) o modal de ações FECHA automaticamente.
// 3) Para status com popup:
//    - RETORNO: só fecha o modal de ações após CONFIRMAR (e fecha também se você "destoggle" retorno -> pendente).
//    - OUTRA CIDADE: só fecha o modal de ações após CONFIRMAR (e fecha também se você "destoggle" outra cidade -> pendente).
// 4) Copiar TF1/TF2/IDP e Ligar NÃO fecham o modal de ações.

import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

type Status =
  | 'PENDENTE'
  | 'NAO_ATENDEU'
  | 'OUTRA_CIDADE'
  | 'ATENDEU'
  | 'CAIXA_POSTAL'
  | 'RETORNO'
  | 'NUMERO_NAO_EXISTE';

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
  OBSERVACAO: string; // RETORNO - HH:MM | OUTRA_CIDADE - CIDADE | livre
};

type StatusFilter = 'TODOS' | 'PENDENTES' | Status;

const PAGE_SIZE = 20;

const API_GET_ENTREGA = 'https://n8n.srv962474.hstgr.cloud/webhook/entregas';
const API_SAVE_PARTE = 'https://n8n.srv962474.hstgr.cloud/webhook-test/parte/salvar';

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
  return String(v || '').trim().replace(/[^\d+]/g, '');
}

function telToDial(v: string) {
  const digits = safeTel(v).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') || digits.startsWith('55')) return digits;
  return `0${digits}`;
}

function toUpperTrim(v: string) {
  return String(v || '').trim().toUpperCase();
}

function sanitizeStatus(raw: string): Status {
  const s = toUpperTrim(raw);

  if (s === 'SEM_RESPOSTA') return 'RETORNO';
  if (s === 'LIGAR_MAIS_TARDE') return 'RETORNO';
  if (s.startsWith('RETORNO')) return 'RETORNO';

  if (
    s === 'PENDENTE' ||
    s === 'ATENDEU' ||
    s === 'OUTRA_CIDADE' ||
    s === 'NAO_ATENDEU' ||
    s === 'CAIXA_POSTAL' ||
    s === 'RETORNO' ||
    s === 'NUMERO_NAO_EXISTE'
  )
    return s as Status;

  return 'PENDENTE';
}

// CSV parser simples (já suporta aspas)
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

function pickKey(obj: Record<string, string>, keys: string[]) {
  for (const k of keys) if (k in obj) return obj[k];
  return '';
}

function csvToRows(csv: string): Row[] {
  const { rows } = parseCsv(csv);
  if (!rows.length) return [];

  return rows.map((r, idx) => {
    const IDP = pickKey(r, ['IDP', 'Idp', 'idp', 'ID']) || String(idx + 1);

    const ESTADO = pickKey(r, ['ESTADO', 'UF', 'Uf']) || '';
    const CIDADE = pickKey(r, ['CIDADE', 'Cidade']) || '';
    const REGIAO_CIDADE = pickKey(r, ['REGIAO_CIDADE', 'REGIÃO CIDADE', 'REGIAO CIDADE', 'REGIÃO', 'REGIAO']) || '';

    const TF1 = pickKey(r, ['TF1', 'TEL1', 'TELEFONE1', 'TELEFONE 1']) || '';
    const TF2 = pickKey(r, ['TF2', 'TEL2', 'TELEFONE2', 'TELEFONE 2']) || '';

    const statusCsv = pickKey(r, ['STATUS', 'Status']) || 'PENDENTE';
    const obsCsv = pickKey(r, ['OBSERVACAO', 'OBSERVAÇÃO', 'Observacao', 'Observação']) || '';

    return {
      id: `row-${idx + 1}`,
      LINE: idx + 1,
      IDP: String(IDP || ''),
      ESTADO: String(ESTADO || ''),
      CIDADE: String(CIDADE || ''),
      REGIAO_CIDADE: String(REGIAO_CIDADE || ''),
      TF1: String(TF1 || ''),
      TF2: String(TF2 || ''),
      STATUS: sanitizeStatus(statusCsv),
      OBSERVACAO: String(obsCsv || ''),
    };
  });
}

// OBS helpers
function retornoLabelFromObs(obs: string) {
  const t = String(obs || '').trim();
  const m = t.match(/RETORNO\s*[-–—]?\s*(\d{1,2}:\d{2})/i);
  return m?.[1] || '';
}
function isRetornoObs(obs: string) {
  return /RETORNO\s*[-–—]?\s*\d{1,2}:\d{2}/i.test(String(obs || '').trim()) || /^RETORNO$/i.test(String(obs || '').trim());
}
function outraCidadeFromObs(obs: string) {
  const t = String(obs || '').trim();
  const m = t.match(/OUTRA_CIDADE\s*[-–—]?\s*(.*)$/i);
  return (m?.[1] || '').trim();
}
function isOutraCidadeObs(obs: string) {
  return /^OUTRA_CIDADE(\s*[-–—].*)?$/i.test(String(obs || '').trim());
}

// status pill
function statusText(row: Row) {
  const s = row.STATUS;

  if (s === 'ATENDEU') return 'ATENDEU';
  if (s === 'NAO_ATENDEU' || s === 'CAIXA_POSTAL') return 'NÃO ATENDEU/CAIXA POSTAL';
  if (s === 'NUMERO_NAO_EXISTE') return 'NÚMERO NÃO EXISTE';

  if (s === 'OUTRA_CIDADE') {
    const city = outraCidadeFromObs(row.OBSERVACAO);
    return city ? `OUTRA CIDADE • ${city}` : 'OUTRA CIDADE';
  }

  if (s === 'RETORNO') {
    const hhmm = retornoLabelFromObs(row.OBSERVACAO);
    return hhmm ? `RETORNO • ${hhmm}` : 'RETORNO';
  }

  return 'PENDENTE';
}

function statusVars(s: Status) {
  switch (s) {
    case 'ATENDEU':
      return { bd: 'var(--success)', bg: 'rgba(22,163,74,.32)' };
    case 'OUTRA_CIDADE':
      return { bd: 'var(--orange)', bg: 'rgba(249,115,22,.34)' };
    case 'RETORNO':
      return { bd: 'var(--blueDark)', bg: 'rgba(30,58,138,.30)' };
    case 'NUMERO_NAO_EXISTE':
      return { bd: 'var(--danger)', bg: 'rgba(239,68,68,.34)' };
    case 'NAO_ATENDEU':
    case 'CAIXA_POSTAL':
      return { bd: 'var(--warning)', bg: 'rgba(245,158,11,.34)' };
    default:
      return { bd: 'var(--border)', bg: 'rgba(0,0,0,.06)' };
  }
}

// bg base da linha por status (um pouco mais forte)
function rowBg(status: Status) {
  switch (status) {
    case 'NAO_ATENDEU':
    case 'CAIXA_POSTAL':
      return 'rgba(245,158,11,.28)';
    case 'OUTRA_CIDADE':
      return 'rgba(249,115,22,.28)';
    case 'ATENDEU':
      return 'rgba(22,163,74,.26)';
    case 'RETORNO':
      return 'rgba(30,58,138,.24)';
    case 'NUMERO_NAO_EXISTE':
      return 'rgba(239,68,68,.24)';
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
  kind: 'danger' | 'warning' | 'success' | 'blueDark' | 'blueLight' | 'orange';
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
  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button
        disabled={disabled}
        onClick={onClick}
        style={{
          border: '1px solid var(--border)',
          background: disabled ? 'var(--surfaceMuted)' : 'var(--primary)',
          color: disabled ? 'var(--text-muted)' : 'var(--primary-text)',
          padding: '9px 12px',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 900,
          cursor: disabled ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
        title={value || ''}
      >
        {label} 📞
      </button>

      <button
        disabled={!value}
        onClick={onCopy}
        style={{
          border: '1px solid rgba(0,0,0,.18)',
          background: 'rgba(0,0,0,.06)',
          color: 'var(--text)',
          padding: '9px 12px',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 900,
          cursor: !value ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
        title={value ? `Copiar ${label}` : ''}
      >
        {`COPIAR ${label}`}
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
function OutraCidadeModal({
  open,
  initialValue,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (city: string) => void;
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
          <div style={stylesModal.title}>🟠 Outra cidade</div>
          <div style={stylesModal.sub}>Digite o nome da cidade</div>
        </div>

        <div style={{ padding: 12 }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex: Santos"
            style={stylesModal.textInput}
          />

          <div style={stylesModal.rowBtns}>
            <button style={styles.btn} onClick={onCancel}>
              Cancelar
            </button>
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => onConfirm(String(value || '').trim())}>
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================
// MODAL: Ações da linha (todos os botões)
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
}: {
  open: boolean;
  row: Row | null;
  onClose: () => void;
  onToggleStatus: (next: Exclude<Status, 'PENDENTE'>) => void;
  onCall: (which: 'TF1' | 'TF2') => void;
  onCopy: (label: string, value: string) => void;
  onOpenRetorno: () => void;
  onOpenOutraCidade: () => void;
}) {
  if (!open || !row) return null;

  const tf1 = safeTel(row.TF1);
  const tf2 = safeTel(row.TF2);

  const isNaoAtendeuOuCaixa = row.STATUS === 'NAO_ATENDEU' || row.STATUS === 'CAIXA_POSTAL';

  return (
    <div onClick={onClose} style={stylesModal.overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...stylesModal.box, width: 'min(560px, 96vw)' }}>
        <div style={stylesModal.header}>
          <div style={stylesModal.title}>Ações • IDP {row.IDP}</div>
          <div style={stylesModal.sub}>
            Status atual: <b>{statusText(row)}</b>
          </div>
        </div>

        <div style={{ padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <ActionButton
            active={isNaoAtendeuOuCaixa}
            kind="warning"
            onClick={() => {
              onToggleStatus('NAO_ATENDEU');
              onClose(); // ✅ fecha ao selecionar status
            }}
          >
            🟡 Não atendeu/caixa postal
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'OUTRA_CIDADE'}
            kind="orange"
            onClick={() => {
              if (row.STATUS === 'OUTRA_CIDADE') {
                onToggleStatus('OUTRA_CIDADE'); // toggle -> pendente
                onClose(); // ✅ fecha ao destoggle
                return;
              }
              // ✅ só abre popup; status será definido no Confirm do popup
              onOpenOutraCidade();
            }}
          >
            🟠 Outra cidade
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'NUMERO_NAO_EXISTE'}
            kind="danger"
            onClick={() => {
              onToggleStatus('NUMERO_NAO_EXISTE');
              onClose(); // ✅ fecha ao selecionar status
            }}
          >
            🔴 Número não existe
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'RETORNO'}
            kind="blueDark"
            onClick={() => {
              if (row.STATUS === 'RETORNO') {
                onToggleStatus('RETORNO'); // toggle -> pendente
                onClose(); // ✅ fecha ao destoggle
                return;
              }
              // ✅ só abre popup; status será definido no Confirm do popup
              onOpenRetorno();
            }}
          >
            🟦 Retorno
          </ActionButton>

          <ActionButton
            active={row.STATUS === 'ATENDEU'}
            kind="success"
            onClick={() => {
              onToggleStatus('ATENDEU');
              onClose(); // ✅ fecha ao selecionar status
            }}
          >
            🟢 Atendeu
          </ActionButton>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--surfaceMuted)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => onCopy('IDP', row.IDP)} title="Copiar IDP">
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

  // ✅ snackbar
  const [toast, setToast] = useState<string>('');

  const [dirty, setDirty] = useState<Record<string, { STATUS: Status; OBSERVACAO: string }>>({});
  const dirtyCount = useMemo(() => Object.keys(dirty).length, [dirty]);

  // MODAIS
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string>('');
  const activeRow = useMemo(() => allRows.find((r) => r.id === activeRowId) || null, [allRows, activeRowId]);

  const [retornoModalOpen, setRetornoModalOpen] = useState(false);
  const [retornoInitial, setRetornoInitial] = useState<string>('');

  const [outraCidadeModalOpen, setOutraCidadeModalOpen] = useState(false);
  const [outraCidadeInitial, setOutraCidadeInitial] = useState<string>('');

  // ✅ GET
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

  // ✅ payload -> rows
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

  function markDirty(row: Row, patch: { STATUS?: Status; OBSERVACAO?: string }) {
    const nextStatus = patch.STATUS ?? row.STATUS;
    const nextObs = patch.OBSERVACAO ?? row.OBSERVACAO ?? '';

    setDirty((prev) => ({
      ...prev,
      [String(row.LINE)]: {
        STATUS: nextStatus,
        OBSERVACAO: nextObs,
      },
    }));
    setSaveTick((x) => x + 1);
  }

  // ✅ limpa OBS quando sai de retorno/outra cidade
  function toggleStatusForRow(row: Row, next: Exclude<Status, 'PENDENTE'>) {
    const newStatus: Status = row.STATUS === next ? 'PENDENTE' : next;

    let nextObs = row.OBSERVACAO;

    if (row.STATUS === 'RETORNO' && newStatus !== 'RETORNO' && isRetornoObs(nextObs)) nextObs = '';
    if (row.STATUS === 'OUTRA_CIDADE' && newStatus !== 'OUTRA_CIDADE' && isOutraCidadeObs(nextObs)) nextObs = '';

    updateRow(row.id, { STATUS: newStatus, OBSERVACAO: nextObs });
    markDirty(row, { STATUS: newStatus, OBSERVACAO: nextObs });
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
    const obs = `RETORNO - ${hhmm}`;
    updateRow(row.id, { STATUS: 'RETORNO', OBSERVACAO: obs });
    markDirty(row, { STATUS: 'RETORNO', OBSERVACAO: obs });
    setRetornoModalOpen(false);
    setActionsOpen(false); // ✅ fecha ações só após confirmar
  }

  function openOutraCidadePicker(row: Row) {
    const current = outraCidadeFromObs(row.OBSERVACAO) || '';
    setOutraCidadeInitial(current);
    setOutraCidadeModalOpen(true);
  }

  function confirmOutraCidade(city: string) {
    const row = activeRow;
    if (!row) {
      setOutraCidadeModalOpen(false);
      return;
    }
    const cleaned = String(city || '').trim();
    const obs = cleaned ? `OUTRA_CIDADE - ${cleaned}` : 'OUTRA_CIDADE';
    updateRow(row.id, { STATUS: 'OUTRA_CIDADE', OBSERVACAO: obs });
    markDirty(row, { STATUS: 'OUTRA_CIDADE', OBSERVACAO: obs });
    setOutraCidadeModalOpen(false);
    setActionsOpen(false); // ✅ fecha ações só após confirmar
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

  // ✅ AUTOSAVE
  useEffect(() => {
    const entrega_id = getEntregaIdOnly();
    if (!entrega_id) return;

    const entries = Object.entries(dirty);
    if (!entries.length) return;

    const t = setTimeout(async () => {
      const changes = entries.map(([lineStr, v]) => ({
        LINE: Number(lineStr),
        STATUS: v.STATUS,
        OBSERVACAO: v.OBSERVACAO || '',
        ts: new Date().toISOString(),
      }));

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
  const tratados = useMemo(() => filteredRows.filter((r) => r.STATUS !== 'PENDENTE').length, [filteredRows]); // ✅ sem "concluídos"
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

      {/* MODAIS */}
      <RowActionsModal
        open={actionsOpen}
        row={activeRow}
        onClose={() => setActionsOpen(false)}
        onToggleStatus={(next) => activeRow && toggleStatusForRow(activeRow, next)}
        onCall={(which) => activeRow && callPhoneForRow(activeRow, which)}
        onCopy={copyToClipboard}
        onOpenRetorno={() => activeRow && openRetornoPicker(activeRow)}
        onOpenOutraCidade={() => activeRow && openOutraCidadePicker(activeRow)}
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
                <option value="ATENDEU">Status: Atendeu</option>
                <option value="OUTRA_CIDADE">Status: Outra cidade</option>
                <option value="NAO_ATENDEU">Status: Não atendeu/caixa postal</option>
                <option value="NUMERO_NAO_EXISTE">Status: Número não existe</option>
                <option value="RETORNO">Status: Retorno</option>
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
                        : r.STATUS === 'RETORNO'
                        ? 'rgba(30,58,138,.36)'
                        : r.STATUS === 'ATENDEU'
                        ? 'rgba(22,163,74,.34)'
                        : r.STATUS === 'NUMERO_NAO_EXISTE'
                        ? 'rgba(239,68,68,.34)'
                        : r.STATUS === 'NAO_ATENDEU' || r.STATUS === 'CAIXA_POSTAL'
                        ? 'rgba(245,158,11,.40)'
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

                        {/* ✅ IDP não copia mais ao clicar */}
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

      {/* ✅ SNACKBAR (popup pequeno embaixo, some em 3s) */}
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

  // ✅ Snackbar embaixo
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