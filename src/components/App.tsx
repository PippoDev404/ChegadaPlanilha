import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

/**
 * ✅ Status ajustados:
 * - "SEM_RESPOSTA" -> "LIGAR_MAIS_TARDE"
 * - "CAIXA_POSTAL" some como botão próprio; fica agrupado com "NAO_ATENDEU" (compat)
 * - "CAIXA_POSTAL" (compat) + novo "NUMERO_NAO_EXISTE"
 */
type Status =
  | 'PENDENTE'
  | 'NAO_ATENDEU'
  | 'OUTRA_CIDADE'
  | 'ATENDEU'
  | 'CAIXA_POSTAL' // compat (se já existir salvo)
  | 'LIGAR_MAIS_TARDE'
  | 'NUMERO_NAO_EXISTE';

type PartePayload = {
  telegram_id?: string;
  telegram_username?: string;
  categoria?: string; // "PARTE"
  chave_parte?: string; // "P03"
  total_linhas?: number;
  tamanho_bytes?: number;
  csv?: string; // CSV em string
};

type Row = {
  id: string;
  LINE: number;
  IDP: string;

  // geo (podem sumir do CSV -> fica '')
  ESTADO: string;
  CIDADE: string;
  REGIAO_CIDADE: string;

  TF1: string;
  TF2: string;

  STATUS: Status;
  OBSERVACAO: string;
};

type StatusFilter = 'TODOS' | 'PENDENTES' | 'CONCLUIDOS' | Status;

const PAGE_SIZE = 20;
const API_BASE = 'https://n8n.srv962474.hstgr.cloud/webhook';

// =========================
// CSS / THEME
// =========================
const globalCss = `
:root{
  --bg: #000000;
  --surface: #191919;
  --surface-2: #1e1e1e;
  --text: #FFFFFF;
  --text-muted: #CFCFCF;
  --border: #424242;

  --primary: #FFFFFF;
  --primary-text: #0B0B0B;

  --secondary: #1A1A1A;
  --secondary-text: #FFFFFF;

  --success: #22C55E;
  --warning: #F59E0B;
  --danger:  #EF4444;

  --blueDark: #1E3A8A;   /* Ligar mais tarde */
  --blueLight: #38BDF8;  /* Número não existe */

  --shadow: 0 10px 30px rgba(0,0,0,.35);
  --radius: 15px;
}

body{
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #000000 0%, #0a0a0a 100%);
  margin: 0;
  padding: 0;
}
*{ box-sizing: border-box; }
button:disabled{ opacity: .55; cursor: not-allowed !important; }
`;

// =========================
// HELPERS
// =========================
function safeTel(v: string) {
  return String(v || '').trim().replace(/[^\d+]/g, '');
}

/**
 * ✅ Aceita:
 * ?csvId=...
 * ?id=...
 */
function getCsvIdFromUrl(): string {
  const sp = new URLSearchParams(window.location.search || '');
  const direct = sp.get('csvId') || sp.get('id') || '';
  if (direct) return direct;

  const h = window.location.hash || '';
  const q = h.includes('?') ? h.split('?')[1] : '';
  const hp = new URLSearchParams(q);
  return hp.get('csvId') || hp.get('id') || '';
}

/**
 * ✅ Aceita:
 * ?entregaId=... (preferencial)
 * ?telegram_id=...
 * ?tid=...
 * ?id=...
 */
function getEntregaIdFromUrl(): string {
  const sp = new URLSearchParams(window.location.search || '');
  const direct = sp.get('entregaId') || sp.get('telegram_id') || sp.get('tid') || sp.get('id') || '';
  if (direct) return direct;

  const h = window.location.hash || '';
  const q = h.includes('?') ? h.split('?')[1] : '';
  const hp = new URLSearchParams(q);
  return hp.get('entregaId') || hp.get('telegram_id') || hp.get('tid') || hp.get('id') || '';
}

function getTelegramId(): string {
  const w: any = window as any;
  const tgId = w?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (tgId) return String(tgId);
  return getEntregaIdFromUrl();
}

function getParteFromUrl(): string {
  const sp = new URLSearchParams(window.location.search || '');
  const direct = sp.get('parte') || sp.get('chave_parte') || '';
  if (direct) return direct;

  const h = window.location.hash || '';
  const q = h.includes('?') ? h.split('?')[1] : '';
  const hp = new URLSearchParams(q);
  return hp.get('parte') || hp.get('chave_parte') || '';
}

function statusText(s: Status) {
  if (s === 'ATENDEU') return 'CONCLUÍDO • ATENDEU';
  if (s === 'OUTRA_CIDADE') return 'CONCLUÍDO • OUTRA CIDADE';
  if (s === 'NAO_ATENDEU') return 'CONCLUÍDO • NÃO ATENDEU/CAIXA POSTAL';
  if (s === 'CAIXA_POSTAL') return 'CONCLUÍDO • NÃO ATENDEU/CAIXA POSTAL';
  if (s === 'LIGAR_MAIS_TARDE') return 'CONCLUÍDO • LIGAR MAIS TARDE';
  if (s === 'NUMERO_NAO_EXISTE') return 'CONCLUÍDO • NÚMERO NÃO EXISTE';
  return 'PENDENTE';
}

function statusVars(s: Status) {
  switch (s) {
    case 'ATENDEU':
      return { bd: 'var(--success)', bg: 'rgba(34,197,94,.14)' };

    case 'OUTRA_CIDADE':
      return { bd: 'var(--warning)', bg: 'rgba(245,158,11,.14)' };

    case 'LIGAR_MAIS_TARDE':
      return { bd: 'var(--blueDark)', bg: 'rgba(30,58,138,.18)' };

    case 'NUMERO_NAO_EXISTE':
      return { bd: 'var(--blueLight)', bg: 'rgba(56,189,248,.16)' };

    case 'NAO_ATENDEU':
    case 'CAIXA_POSTAL': // agrupado visualmente
      return { bd: 'var(--danger)', bg: 'rgba(239,68,68,.14)' };

    default:
      return { bd: 'var(--border)', bg: 'rgba(255,255,255,.06)' };
  }
}

function rowBg(status: Status) {
  switch (status) {
    case 'NAO_ATENDEU':
    case 'CAIXA_POSTAL':
      return 'rgba(239,68,68,.16)';
    case 'OUTRA_CIDADE':
      return 'rgba(245,158,11,.16)';
    case 'ATENDEU':
      return 'rgba(34,197,94,.16)';
    case 'LIGAR_MAIS_TARDE':
      return 'rgba(30,58,138,.16)';
    case 'NUMERO_NAO_EXISTE':
      return 'rgba(56,189,248,.14)';
    default:
      return 'transparent';
  }
}

/**
 * CSV parser simples (suporta aspas)
 */
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

function toUpperTrim(v: string) {
  return String(v || '').trim().toUpperCase();
}

function sanitizeStatus(raw: string): Status {
  const s = toUpperTrim(raw);

  // aceita também legados
  if (s === 'SEM_RESPOSTA') return 'LIGAR_MAIS_TARDE';

  if (
    s === 'PENDENTE' ||
    s === 'ATENDEU' ||
    s === 'OUTRA_CIDADE' ||
    s === 'NAO_ATENDEU' ||
    s === 'CAIXA_POSTAL' ||
    s === 'LIGAR_MAIS_TARDE' ||
    s === 'NUMERO_NAO_EXISTE'
  )
    return s as Status;

  return 'PENDENTE';
}

function csvToAppRows(csv: string, parteFallback = 'P01'): { parte: string; rows: Row[] } {
  const { rows } = parseCsv(csv);
  if (!rows.length) return { parte: parteFallback, rows: [] };

  const first = rows[0];
  const parte = pickKey(first, ['Nº PESQ.', 'N_PESQ', 'N PESQ', 'N PESQ.']) || parteFallback;

  const out: Row[] = rows.map((r, idx) => {
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

  return { parte: String(parte || parteFallback), rows: out };
}

// =========================
// UI PIECES
// =========================
function StatusPill({ status }: { status: Status }) {
  const c = statusVars(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 999,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        fontWeight: 900,
        fontSize: 10,
        color: 'var(--text)',
        whiteSpace: 'nowrap',
      }}
    >
      {statusText(status)}
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
  kind: 'danger' | 'warning' | 'success' | 'blueDark' | 'blueLight';
  children: React.ReactNode;
  onClick: () => void;
}) {
  const base =
    kind === 'danger'
      ? { border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.14)' }
      : kind === 'warning'
        ? { border: '1px solid rgba(245,158,11,.45)', background: 'rgba(245,158,11,.14)' }
        : kind === 'blueDark'
          ? { border: '1px solid rgba(30,58,138,.55)', background: 'rgba(30,58,138,.18)' }
          : kind === 'blueLight'
            ? { border: '1px solid rgba(56,189,248,.55)', background: 'rgba(56,189,248,.16)' }
            : { border: '1px solid rgba(34,197,94,.45)', background: 'rgba(34,197,94,.14)' };

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
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
}: {
  label: string;
  value: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        border: '1px solid var(--border)',
        background: disabled ? 'var(--surface)' : 'var(--primary)',
        color: disabled ? 'var(--text-muted)' : 'var(--primary-text)',
        padding: '6px 10px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 900,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
      title={value || ''}
    >
      {label} 📞
    </button>
  );
}

function RowActions({
  row,
  onToggleStatus,
  onCall,
}: {
  row: Row;
  onToggleStatus: (next: Exclude<Status, 'PENDENTE'>) => void;
  onCall: (which: 'TF1' | 'TF2') => void;
}) {
  const tf1 = safeTel(row.TF1);
  const tf2 = safeTel(row.TF2);

  const isNaoAtendeuOuCaixa = row.STATUS === 'NAO_ATENDEU' || row.STATUS === 'CAIXA_POSTAL';

  return (
    <div style={styles.actionsInline}>
      <div style={styles.inlineGroup}>
        <ActionButton active={isNaoAtendeuOuCaixa} kind="danger" onClick={() => onToggleStatus('NAO_ATENDEU')}>
          🔴 Não atendeu/caixa postal
        </ActionButton>

        <ActionButton active={row.STATUS === 'OUTRA_CIDADE'} kind="warning" onClick={() => onToggleStatus('OUTRA_CIDADE')}>
          🟠 Outra cidade
        </ActionButton>

        <ActionButton active={row.STATUS === 'NUMERO_NAO_EXISTE'} kind="blueLight" onClick={() => onToggleStatus('NUMERO_NAO_EXISTE')}>
          🔵 Número não existe
        </ActionButton>

        <ActionButton active={row.STATUS === 'LIGAR_MAIS_TARDE'} kind="blueDark" onClick={() => onToggleStatus('LIGAR_MAIS_TARDE')}>
          🟦 Ligar mais tarde
        </ActionButton>

        <ActionButton active={row.STATUS === 'ATENDEU'} kind="success" onClick={() => onToggleStatus('ATENDEU')}>
          🟢 Atendeu
        </ActionButton>
      </div>

      <div style={styles.inlineGroup}>
        <MiniTel label="TF1" value={row.TF1} disabled={!tf1} onClick={() => onCall('TF1')} />
        <MiniTel label="TF2" value={row.TF2} disabled={!tf2} onClick={() => onCall('TF2')} />
      </div>
    </div>
  );
}

function FragmentRow({
  row,
  isExpanded,
  baseBg,
  onToggleExpand,
  onToggleStatus,
  onCall,
  geoCols,
  onCopy,
}: {
  row: Row;
  isExpanded: boolean;
  baseBg: string;
  onToggleExpand: () => void;
  onToggleStatus: (next: Exclude<Status, 'PENDENTE'>) => void;
  onCall: (which: 'TF1' | 'TF2') => void;
  geoCols: { estado: boolean; cidade: boolean; regiao: boolean };
  onCopy: (label: string, value: string) => void;
}) {
  const selectedBg = 'rgba(255,255,255,.07)';

  return (
    <>
      <tr
        style={{
          ...styles.tr,
          background: isExpanded ? selectedBg : baseBg,
          outline: isExpanded ? '1px solid rgba(255,255,255,.18)' : '1px solid transparent',
        }}
        onClick={onToggleExpand}
      >
        <td style={styles.td}>
          <StatusPill status={row.STATUS} />
        </td>

        <td
          style={{ ...styles.td, cursor: 'copy' }}
          title="Clique para copiar IDP"
          onClick={(e) => {
            e.stopPropagation();
            onCopy('IDP', row.IDP);
          }}
        >
          {row.IDP}
        </td>

        {geoCols.estado ? (
          <td
            style={{ ...styles.td, cursor: 'copy' }}
            title="Clique para copiar Estado"
            onClick={(e) => {
              e.stopPropagation();
              onCopy('Estado', row.ESTADO);
            }}
          >
            {row.ESTADO || '—'}
          </td>
        ) : null}

        {geoCols.cidade ? (
          <td
            style={{ ...styles.td, cursor: 'copy' }}
            title="Clique para copiar Cidade"
            onClick={(e) => {
              e.stopPropagation();
              onCopy('Cidade', row.CIDADE);
            }}
          >
            {row.CIDADE || '—'}
          </td>
        ) : null}

        {geoCols.regiao ? (
          <td
            style={{ ...styles.td, cursor: 'copy' }}
            title="Clique para copiar Região"
            onClick={(e) => {
              e.stopPropagation();
              onCopy('Região', row.REGIAO_CIDADE);
            }}
          >
            {row.REGIAO_CIDADE || '—'}
          </td>
        ) : null}

        <td style={styles.td}>{row.TF1 || '—'}</td>
        <td style={styles.td}>{row.TF2 || '—'}</td>
      </tr>

      {isExpanded ? (
        <tr style={{ background: 'var(--surface-2)' }}>
          <td colSpan={2 + (geoCols.estado ? 1 : 0) + (geoCols.cidade ? 1 : 0) + (geoCols.regiao ? 1 : 0) + 2} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
            <RowActions row={row} onToggleStatus={onToggleStatus} onCall={onCall} />
          </td>
        </tr>
      ) : null}
    </>
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
  const [parte, setParte] = useState<string>('');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS');
  const [cidadeFilter, setCidadeFilter] = useState<string>('TODAS');
  const [regiaoFilter, setRegiaoFilter] = useState<string>('TODAS');

  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string>('');

  // ✅ copiar
  const [toast, setToast] = useState<string>('');

  // ✅ alterações pendentes (LINE => {STATUS, OBSERVACAO})
  const [dirty, setDirty] = useState<Record<string, { STATUS: Status; OBSERVACAO: string }>>({});
  const dirtyCount = useMemo(() => Object.keys(dirty).length, [dirty]);

  // =========================
  // 1) FETCH payload por csvId
  // =========================
  useEffect(() => {
    const csvId = getCsvIdFromUrl();
    if (!csvId) return;

    (async () => {
      try {
        setLoading(true);
        setError('');
        setPayload(null);

        const url = `${API_BASE.replace(/\/$/, '')}/entregas?id=${encodeURIComponent(csvId)}`;
        const resp = await fetch(url, { cache: 'no-store' });

        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} • ${t || 'Sem body'}`);
        }

        const data = await resp.json();
        setPayload(Array.isArray(data) ? data : [data]);
      } catch (e: any) {
        setError(String(e?.message || e || 'Erro ao buscar payload'));
        setPayload(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ✅ 2) opcional: payload via evento
  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent;
      const data = ce?.detail;
      if (Array.isArray(data)) setPayload(data);
    };
    window.addEventListener('IBESPE_PAYLOAD', handler as any);
    return () => window.removeEventListener('IBESPE_PAYLOAD', handler as any);
  }, []);

  // ✅ 3) Quando payload chegar, preenche rows/parte
  useEffect(() => {
    if (!payload || payload.length === 0) return;

    const item = payload[0] as PartePayload;
    const parteFromApi = String(item?.chave_parte || 'P01');
    const csv = String(item?.csv || '');

    if (!csv) {
      setParte(parteFromApi);
      setAllRows([]);
      setError('Payload chegou, mas não veio o CSV.');
      return;
    }

    const parsed = csvToAppRows(csv, parteFromApi);
    setParte(parsed.parte || parteFromApi);
    setAllRows(parsed.rows);
    setDirty({});
    setExpandedId('');
    setPage(1);
    setError('');
  }, [payload]);

  // =========================
  // Detecta se geo cols estão vazias (para ocultar)
  // =========================
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

  // =========================
  // Filtragem (sem busca textual)
  // =========================
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

      if (statusFilter === 'PENDENTES') {
        if (r.STATUS !== 'PENDENTE') return false;
      } else if (statusFilter === 'CONCLUIDOS') {
        if (r.STATUS === 'PENDENTE') return false;
      } else if (statusFilter !== 'TODOS') {
        if (r.STATUS !== statusFilter) return false;
      }

      return true;
    });
  }, [allRows, statusFilter, estadoFilter, cidadeFilter, regiaoFilter, geoCols]);

  useEffect(() => setPage(1), [statusFilter, estadoFilter, cidadeFilter, regiaoFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(from, from + PAGE_SIZE);
  }, [filteredRows, page]);

  useEffect(() => {
    if (!expandedId) return;
    if (!pageRows.some((r) => r.id === expandedId)) setExpandedId('');
  }, [pageRows, expandedId]);

  function updateRow(id: string, patch: Partial<Row>) {
    setAllRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleStatusForRow(row: Row, next: Exclude<Status, 'PENDENTE'>) {
    const newStatus: Status = row.STATUS === next ? 'PENDENTE' : next;
    updateRow(row.id, { STATUS: newStatus });

    setDirty((prev) => ({
      ...prev,
      [String(row.LINE)]: {
        STATUS: newStatus,
        OBSERVACAO: prev[String(row.LINE)]?.OBSERVACAO ?? row.OBSERVACAO ?? '',
      },
    }));

    setSaveTick((x) => x + 1);
  }

  // =========================
  // AUTOSAVE (debounce 800ms)
  // =========================
  useEffect(() => {
    const entregaId = getTelegramId();
    const parteUrl = getParteFromUrl() || parte || (payload?.[0]?.chave_parte ? String(payload[0].chave_parte) : '');

    if (!entregaId || !parteUrl) return;

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

        const url = `${API_BASE.replace(/\/$/, '')}/parte/salvar`;

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            telegram_id: entregaId,
            chave_parte: parteUrl,
            changes,
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} • ${txt || 'Sem body'}`);
        }

        setDirty({});
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch (e: any) {
        const msg = String(e?.message || e);
        // ✅ "Failed to fetch" normalmente é CORS / endpoint inválido / rede
        if (msg.toLowerCase().includes('failed to fetch')) {
          setSaveError(
            'Failed to fetch — normalmente é CORS ou endpoint /parte/salvar inexistente no n8n. Verifique: CORS (Access-Control-Allow-Origin), SSL e se a rota /parte/salvar está publicada.'
          );
        } else {
          setSaveError(msg);
        }
      } finally {
        setSaving(false);
      }
    }, 800);

    return () => clearTimeout(t);
  }, [saveTick, dirty, parte, payload]);

  function callPhoneForRow(row: Row, which: 'TF1' | 'TF2') {
    const tel = safeTel(row[which]);
    if (!tel) return;
    window.location.href = `tel:${tel}`;
  }

  async function copyToClipboard(label: string, value: string) {
    const v = String(value || '').trim();
    if (!v) return;

    try {
      await navigator.clipboard.writeText(v);
      setToast(`Copiado (${label}): ${v}`);
      setTimeout(() => setToast(''), 1600);
    } catch {
      // fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = v;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setToast(`Copiado (${label}): ${v}`);
        setTimeout(() => setToast(''), 1600);
      } catch {
        setToast('Não foi possível copiar.');
        setTimeout(() => setToast(''), 1600);
      }
    }
  }

  // contagens
  const pendentes = useMemo(() => filteredRows.filter((r) => r.STATUS === 'PENDENTE').length, [filteredRows]);
  const concluidos = useMemo(() => filteredRows.filter((r) => r.STATUS !== 'PENDENTE').length, [filteredRows]);

  const hasData = allRows.length > 0;

  const hintLink = useMemo(() => {
    const base = `${window.location.origin}${window.location.pathname}#/?`;
    return `${base}csvId=SEU_CSVID&entregaId=SEU_TELEGRAM_ID&parte=P03`;
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

      {!hasData ? (
        <div style={styles.card}>
          <div style={{ padding: 14, color: 'var(--text)' }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>{loading ? 'Carregando…' : 'Aguardando dados…'}</div>

            <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 11 }}>
              {loading ? 'Buscando o CSV no servidor (n8n → Supabase).' : 'Abra com csvId para carregar. Exemplo:'}
            </div>

            {!loading && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  wordBreak: 'break-all',
                }}
              >
                {hintLink}
              </div>
            )}

            {error ? (
              <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--danger)', borderRadius: 10 }}>
                <div style={{ fontWeight: 900 }}>⚠️ Erro</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{error}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>
                  Se aparecer “CORS” no console, seu n8n precisa liberar Access-Control-Allow-Origin.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div style={styles.topbarLocal}>
            <div style={{ minWidth: 240 }}>
              <div style={styles.h1}>
                Atendimento {parte ? <span style={{ color: 'var(--text-muted)' }}>• {parte}</span> : null}
              </div>

              <div style={styles.sub}>
                Registros: <b>{filteredRows.length}</b> (filtrado) • Concluídos: <b>{concluidos}</b> • Pendentes: <b>{pendentes}</b>
              </div>

              <div style={{ ...styles.sub, marginTop: 4 }}>
                Salvando:{' '}
                <b style={{ color: saving ? 'var(--warning)' : 'var(--text-muted)' }}>{saving ? 'SIM' : 'NÃO'}</b>

                {lastSavedAt && (
                  <span style={{ marginLeft: 8 }}>
                    Último: <b>{lastSavedAt}</b>
                  </span>
                )}
              </div>

              <div style={{ ...styles.sub, marginTop: 4 }}>
                Alterações pendentes:{' '}
                <b style={{ color: dirtyCount ? 'var(--warning)' : 'var(--text-muted)' }}>{dirtyCount}</b>
              </div>

              {saveError && (
                <div style={{ marginTop: 6, padding: 8, border: '1px solid var(--danger)', borderRadius: 8, fontSize: 11 }}>
                  ❌ {saveError}
                </div>
              )}

              {toast && (
                <div style={{ marginTop: 6, padding: 8, border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, fontSize: 11 }}>
                  ✅ {toast}
                </div>
              )}
            </div>

            <div style={styles.filtersRow}>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={styles.select}>
                <option value="TODOS">Status: Todos</option>
                <option value="PENDENTES">Status: Pendentes</option>
                <option value="CONCLUIDOS">Status: Concluídos</option>

                <option value="ATENDEU">Status: Atendeu</option>
                <option value="OUTRA_CIDADE">Status: Outra cidade</option>
                <option value="NAO_ATENDEU">Status: Não atendeu/caixa postal</option>
                <option value="NUMERO_NAO_EXISTE">Status: Número não existe</option>
                <option value="LIGAR_MAIS_TARDE">Status: Ligar mais tarde</option>
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

            {/* Paginação em cima */}
            <PaginationControls />
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>Tabela (20 por página)</div>
                <div style={styles.cardSub}>Clique na linha para expandir. Clique em IDP/Estado/Cidade/Região para copiar.</div>
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
                    const isExpanded = expandedId === r.id;
                    const baseBg = rowBg(r.STATUS);

                    return (
                      <FragmentRow
                        key={r.id}
                        row={r}
                        isExpanded={isExpanded}
                        baseBg={baseBg}
                        geoCols={geoCols}
                        onToggleExpand={() => setExpandedId((cur) => (cur === r.id ? '' : r.id))}
                        onToggleStatus={(next) => toggleStatusForRow(r, next)}
                        onCall={(which) => callPhoneForRow(r, which)}
                        onCopy={(label, value) => copyToClipboard(label, value)}
                      />
                    );
                  })}

                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={2 + (geoCols.estado ? 1 : 0) + (geoCols.cidade ? 1 : 0) + (geoCols.regiao ? 1 : 0) + 2} style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12 }}>
                        Nenhum registro encontrado com esses filtros.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={styles.footerHint}>✅ Clique no mesmo botão novamente para voltar a PENDENTE.</div>

            {/* Paginação em baixo */}
            <div style={{ padding: 10, borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <PaginationControls />
            </div>
          </div>

          <style>{`
            @media (max-width: 1024px){
              table { min-width: 760px !important; }
            }
            @media (max-width: 820px){
              table { min-width: 720px !important; }
            }
            @media (max-width: 680px){
              table { min-width: 680px !important; }
            }
          `}</style>
        </>
      )}
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
    background: 'var(--surface)',
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
  h1: { fontWeight: 900, fontSize: 14, color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },

  filtersRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    maxWidth: 860,
  },

  select: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    padding: '9px 10px',
    borderRadius: 10,
    fontSize: 12,
    outline: 'none',
  },

  nav: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  pill: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    padding: '7px 9px',
    borderRadius: 999,
    fontSize: 12,
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },

  btn: {
    border: '1px solid var(--border)',
    background: 'var(--secondary)',
    color: 'var(--secondary-text)',
    padding: '9px 11px',
    borderRadius: 10,
    fontWeight: 900,
    fontSize: 12,
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
    background: 'var(--surface-2)',
  },
  cardTitle: { fontWeight: 900, fontSize: 13, color: 'var(--text)' },
  cardSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },

  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 860 },
  th: {
    position: 'sticky',
    top: 0,
    background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)',
    padding: '8px 10px',
    fontSize: 12,
    textAlign: 'left',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  tr: { cursor: 'pointer' },
  td: {
    borderBottom: '1px solid var(--border)',
    padding: '9px 10px',
    fontSize: 12,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    userSelect: 'text',
  },

  footerHint: {
    padding: 10,
    color: 'var(--text-muted)',
    fontSize: 12,
  },

  btnAction: {
    padding: '7px 10px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: 'var(--text)',
  },
  btnActive: {
    outline: '2px solid rgba(255,255,255,.18)',
  },

  actionsInline: {
    padding: 10,
    borderTop: '1px solid var(--border)',
    background: 'var(--surface-2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  inlineGroup: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
};