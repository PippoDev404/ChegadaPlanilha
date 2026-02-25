import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

/**
 * ✅ Ajuste aqui os status que você quer usar no seu projeto.
 * Eu mantive os seus e adicionei CAIXA_POSTAL / SEM_RESPOSTA como exemplo.
 */
type Status = 'PENDENTE' | 'NAO_ATENDEU' | 'OUTRA_CIDADE' | 'ATENDEU' | 'CAIXA_POSTAL' | 'SEM_RESPOSTA';

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
  ESTADO: string;
  CIDADE: string;
  REGIAO_CIDADE: string;
  TF1: string;
  TF2: string;
  TF3: string;
  TF4: string;
  N_PESQ: string;
  DIA_PESQ: string;

  STATUS: Status;
  OBSERVACAO: string;
};

type StatusFilter = 'TODOS' | 'PENDENTES' | 'CONCLUIDOS' | Status;

const PAGE_SIZE = 20;

/**
 * ✅ Coloque a URL base do seu webhook do n8n (sem path duplicado)
 * Exemplo:
 * https://n8n.seudominio.com/webhook/api
 */
const API_BASE = 'https://n8n.srv962474.hstgr.cloud/webhook/api';

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

function norm(s: string) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getCsvIdFromUrl(): string {
  const sp = new URLSearchParams(window.location.search || '');
  const direct = sp.get('csvId') || sp.get('id') || '';
  if (direct) return direct;

  const h = window.location.hash || '';
  const q = h.includes('?') ? h.split('?')[1] : '';
  const hp = new URLSearchParams(q);
  return hp.get('csvId') || hp.get('id') || '';
}

function statusText(s: Status) {
  if (s === 'ATENDEU') return 'CONCLUÍDO • ATENDEU';
  if (s === 'OUTRA_CIDADE') return 'CONCLUÍDO • OUTRA CIDADE';
  if (s === 'NAO_ATENDEU') return 'CONCLUÍDO • NÃO ATENDEU';
  if (s === 'CAIXA_POSTAL') return 'CONCLUÍDO • CAIXA POSTAL';
  if (s === 'SEM_RESPOSTA') return 'CONCLUÍDO • SEM RESPOSTA';
  return 'PENDENTE';
}

function getTelegramId(): string {
  const w: any = window as any;
  const tgId = w?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (tgId) return String(tgId);

  // fallback para teste fora do Telegram
  return getEntregaIdFromUrl();
}

function statusVars(s: Status) {
  switch (s) {
    case 'ATENDEU':
      return { bd: 'var(--success)', bg: 'rgba(34,197,94,.14)' };
    case 'OUTRA_CIDADE':
    case 'CAIXA_POSTAL':
      return { bd: 'var(--warning)', bg: 'rgba(245,158,11,.14)' };
    case 'NAO_ATENDEU':
    case 'SEM_RESPOSTA':
      return { bd: 'var(--danger)', bg: 'rgba(239,68,68,.14)' };
    default:
      return { bd: 'var(--border)', bg: 'rgba(255,255,255,.06)' };
  }
}

function rowBg(status: Status) {
  switch (status) {
    case 'NAO_ATENDEU':
    case 'SEM_RESPOSTA':
      return 'rgba(239,68,68,.16)';
    case 'OUTRA_CIDADE':
    case 'CAIXA_POSTAL':
      return 'rgba(245,158,11,.16)';
    case 'ATENDEU':
      return 'rgba(34,197,94,.16)';
    default:
      return 'transparent';
  }
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
  const direct =
    sp.get('entregaId') ||
    sp.get('telegram_id') ||
    sp.get('tid') ||
    sp.get('id') ||
    '';
  if (direct) return direct;

  const h = window.location.hash || '';
  const q = h.includes('?') ? h.split('?')[1] : '';
  const hp = new URLSearchParams(q);
  return hp.get('entregaId') || hp.get('telegram_id') || hp.get('tid') || hp.get('id') || '';
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

function csvToAppRows(csv: string, parteFallback = 'P01'): { parte: string; rows: Row[] } {
  const { rows } = parseCsv(csv);
  if (!rows.length) return { parte: parteFallback, rows: [] };

  const first = rows[0];
  const parte =
    pickKey(first, ['Nº PESQ.', 'N_PESQ', 'N PESQ', 'N PESQ.']) ||
    parteFallback;

  const out: Row[] = rows.map((r, idx) => {
    const IDP = pickKey(r, ['IDP', 'Idp', 'idp', 'ID']) || String(idx + 1);
    const ESTADO = pickKey(r, ['ESTADO', 'UF', 'Uf']) || '';
    const CIDADE = pickKey(r, ['CIDADE', 'Cidade']) || '';
    const REGIAO_CIDADE =
      pickKey(r, ['REGIAO_CIDADE', 'REGIÃO CIDADE', 'REGIAO CIDADE', 'REGIÃO', 'REGIAO']) || '';

    const TF1 = pickKey(r, ['TF1', 'TEL1', 'TELEFONE1', 'TELEFONE 1']) || '';
    const TF2 = pickKey(r, ['TF2', 'TEL2', 'TELEFONE2', 'TELEFONE 2']) || '';
    const TF3 = pickKey(r, ['TF3', 'TEL3', 'TELEFONE3', 'TELEFONE 3']) || '';
    const TF4 = pickKey(r, ['TF4', 'TEL4', 'TELEFONE4', 'TELEFONE 4']) || '';

    const DIA_PESQ = pickKey(r, ['DIA PESQ.', 'DIA PESQ', 'DIA_PESQ', 'DATA', 'DIA']) || '';
    const N_PESQ = pickKey(r, ['Nº PESQ.', 'N_PESQ', 'N PESQ', 'N PESQ.']) || parte;

    // ✅ Lê STATUS/OBSERVACAO se vier no CSV (n8n já injeta)
    const statusCsv = (pickKey(r, ['STATUS', 'Status']) || 'PENDENTE').trim().toUpperCase() as Status;
    const obsCsv = pickKey(r, ['OBSERVACAO', 'OBSERVAÇÃO', 'Observacao', 'Observação']) || '';

    // se vier algo desconhecido, cai pra PENDENTE
    const safeStatus: Status =
      statusCsv === 'ATENDEU' ||
        statusCsv === 'OUTRA_CIDADE' ||
        statusCsv === 'NAO_ATENDEU' ||
        statusCsv === 'CAIXA_POSTAL' ||
        statusCsv === 'SEM_RESPOSTA'
        ? statusCsv
        : 'PENDENTE';

    return {
      id: `row-${idx + 1}`,
      LINE: idx + 1,
      IDP: String(IDP || ''),
      ESTADO: String(ESTADO || ''),
      CIDADE: String(CIDADE || ''),
      REGIAO_CIDADE: String(REGIAO_CIDADE || ''),
      TF1: String(TF1 || ''),
      TF2: String(TF2 || ''),
      TF3: String(TF3 || ''),
      TF4: String(TF4 || ''),
      N_PESQ: String(N_PESQ || ''),
      DIA_PESQ: String(DIA_PESQ || ''),
      STATUS: safeStatus,
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
        padding: '3px 7px',
        borderRadius: 999,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        fontWeight: 900,
        fontSize: 9,
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
  kind: 'danger' | 'warning' | 'success';
  children: React.ReactNode;
  onClick: () => void;
}) {
  const base =
    kind === 'danger'
      ? { border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.14)' }
      : kind === 'warning'
        ? { border: '1px solid rgba(245,158,11,.45)', background: 'rgba(245,158,11,.14)' }
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
        padding: '5px 8px',
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 800,
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
  onCall: (which: 'TF1' | 'TF2' | 'TF3' | 'TF4') => void;
}) {
  const tf1 = safeTel(row.TF1);
  const tf2 = safeTel(row.TF2);
  const tf3 = safeTel(row.TF3);
  const tf4 = safeTel(row.TF4);

  return (
    <div style={styles.actionsInline}>
      <div style={styles.inlineGroup}>
        <ActionButton active={row.STATUS === 'NAO_ATENDEU'} kind="danger" onClick={() => onToggleStatus('NAO_ATENDEU')}>
          🔴 Não atendeu
        </ActionButton>

        <ActionButton active={row.STATUS === 'OUTRA_CIDADE'} kind="warning" onClick={() => onToggleStatus('OUTRA_CIDADE')}>
          🟠 Outra cidade
        </ActionButton>

        <ActionButton active={row.STATUS === 'CAIXA_POSTAL'} kind="warning" onClick={() => onToggleStatus('CAIXA_POSTAL')}>
          🟠 Caixa postal
        </ActionButton>

        <ActionButton active={row.STATUS === 'SEM_RESPOSTA'} kind="danger" onClick={() => onToggleStatus('SEM_RESPOSTA')}>
          🔴 Sem resposta
        </ActionButton>

        <ActionButton active={row.STATUS === 'ATENDEU'} kind="success" onClick={() => onToggleStatus('ATENDEU')}>
          🟢 Atendeu
        </ActionButton>
      </div>

      <div style={styles.inlineGroup}>
        <MiniTel label="TF1" value={row.TF1} disabled={!tf1} onClick={() => onCall('TF1')} />
        <MiniTel label="TF2" value={row.TF2} disabled={!tf2} onClick={() => onCall('TF2')} />
        <MiniTel label="TF3" value={row.TF3} disabled={!tf3} onClick={() => onCall('TF3')} />
        <MiniTel label="TF4" value={row.TF4} disabled={!tf4} onClick={() => onCall('TF4')} />
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
}: {
  row: Row;
  isExpanded: boolean;
  baseBg: string;
  onToggleExpand: () => void;
  onToggleStatus: (next: Exclude<Status, 'PENDENTE'>) => void;
  onCall: (which: 'TF1' | 'TF2' | 'TF3' | 'TF4') => void;
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
        <td style={styles.td} title={`LINE ${row.LINE}`}>
          {row.IDP}
          <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 9 }}>#{row.LINE}</span>
        </td>
        <td style={styles.td}>{row.ESTADO || '—'}</td>
        <td style={styles.td}>{row.CIDADE || '—'}</td>
        <td style={styles.td}>{row.REGIAO_CIDADE || '—'}</td>
        <td style={styles.td}>{row.TF1 || '—'}</td>
        <td style={styles.td}>{row.TF2 || '—'}</td>
        <td style={styles.td}>{row.TF3 || '—'}</td>
        <td style={styles.td}>{row.TF4 || '—'}</td>
        <td style={styles.td}>{row.N_PESQ || '—'}</td>
        <td style={styles.td}>{row.DIA_PESQ || '—'}</td>
      </tr>

      {isExpanded ? (
        <tr style={{ background: 'var(--surface-2)' }}>
          <td colSpan={11} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
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

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
  const [regiaoFilter, setRegiaoFilter] = useState<string>('TODAS');

  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string>('');

  // ✅ alterações pendentes (LINE => {STATUS, OBSERVACAO})
  const [dirty, setDirty] = useState<Record<string, { STATUS: Status; OBSERVACAO: string }>>({});
  const dirtyCount = useMemo(() => Object.keys(dirty).length, [dirty]);

  // ✅ 1) Fetch pelo telegram_id e chave_parte via n8n
  useEffect(() => {
  const csvId = getCsvIdFromUrl();
  if (!csvId) return;

  (async () => {
    try {
      setLoading(true);
      setError('');

      const qs = new URLSearchParams({ id: csvId });
      const url = `${API_BASE.replace(/\/$/, '')}/parte/by-id?${qs.toString()}`;

      const resp = await fetch(url);

      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status} ${t}`);
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

  const regioesDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) s.add(String(r.REGIAO_CIDADE || '').trim() || '—');
    return Array.from(s).sort((a, b) => (a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b)));
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const qq = norm(q);

    return allRows.filter((r) => {
      if (regiaoFilter !== 'TODAS') {
        const rr = String(r.REGIAO_CIDADE || '').trim() || '—';
        if (rr !== regiaoFilter) return false;
      }

      if (statusFilter === 'PENDENTES') {
        if (r.STATUS !== 'PENDENTE') return false;
      } else if (statusFilter === 'CONCLUIDOS') {
        if (r.STATUS === 'PENDENTE') return false;
      } else if (statusFilter !== 'TODOS') {
        if (r.STATUS !== statusFilter) return false;
      }

      if (!qq) return true;

      const hay = norm(
        [r.LINE, r.IDP, r.ESTADO, r.CIDADE, r.REGIAO_CIDADE, r.TF1, r.TF2, r.TF3, r.TF4, r.N_PESQ, r.DIA_PESQ, r.STATUS].join(' ')
      );
      return hay.includes(qq);
    });
  }, [allRows, q, statusFilter, regiaoFilter]);

  useEffect(() => setPage(1), [q, statusFilter, regiaoFilter]);

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
        OBSERVACAO: (prev[String(row.LINE)]?.OBSERVACAO ?? row.OBSERVACAO ?? ''),
      },
    }));

    setSaveTick((x) => x + 1);
  }

  useEffect(() => {
    const entregaId = getTelegramId();
    const parteUrl = getParteFromUrl();

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

        const resp = await fetch(`${API_BASE}/parte/salvar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_id: entregaId,
            chave_parte: parteUrl,
            changes,
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(txt || `HTTP ${resp.status}`);
        }

        setDirty({});
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch (e: any) {
        console.error(e);
        setSaveError(String(e?.message || e));
      } finally {
        setSaving(false);
      }
    }, 800);

    return () => clearTimeout(t);
  }, [saveTick, dirty]);

  function callPhoneForRow(row: Row, which: 'TF1' | 'TF2' | 'TF3' | 'TF4') {
    const tel = safeTel(row[which]);
    if (!tel) return;
    window.location.href = `tel:${tel}`;
  }

  // contagens
  const pendentes = useMemo(() => filteredRows.filter((r) => r.STATUS === 'PENDENTE').length, [filteredRows]);
  const concluidos = useMemo(() => filteredRows.filter((r) => r.STATUS !== 'PENDENTE').length, [filteredRows]);
  const atendeu = useMemo(() => filteredRows.filter((r) => r.STATUS === 'ATENDEU').length, [filteredRows]);
  const outraCidade = useMemo(() => filteredRows.filter((r) => r.STATUS === 'OUTRA_CIDADE').length, [filteredRows]);
  const naoAtendeu = useMemo(() => filteredRows.filter((r) => r.STATUS === 'NAO_ATENDEU').length, [filteredRows]);
  const caixaPostal = useMemo(() => filteredRows.filter((r) => r.STATUS === 'CAIXA_POSTAL').length, [filteredRows]);
  const semResposta = useMemo(() => filteredRows.filter((r) => r.STATUS === 'SEM_RESPOSTA').length, [filteredRows]);

  const hasData = allRows.length > 0;

  return (
    <div style={{ padding: 12 }}>
      <style>{globalCss}</style>

      {!hasData ? (
        <div style={styles.card}>
          <div style={{ padding: 14, color: 'var(--text)' }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>
              {loading ? 'Carregando…' : 'Aguardando dados…'}
            </div>
            <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 11 }}>
              {loading
                ? 'Buscando o CSV no servidor (n8n → Supabase).'
                : 'Abra o link com ?entregaId=SEU_TELEGRAM_ID&parte=P03 para carregar a tabela.'}
            </div>

            {error ? (
              <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--danger)', borderRadius: 10 }}>
                <div style={{ fontWeight: 900 }}>⚠️ Erro</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{error}</div>
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
                Registros: <b>{filteredRows.length}</b> (filtrado) • Concluídos: <b>{concluidos}</b>
              </div>
              <div style={{ ...styles.sub, marginTop: 4 }}>
                Alterações pendentes:{' '}
                <div style={{ ...styles.sub, marginTop: 4 }}>
                  Salvando: <b style={{ color: saving ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {saving ? 'SIM' : 'NÃO'}
                  </b>

                  {lastSavedAt && (
                    <span style={{ marginLeft: 8 }}>
                      Último: <b>{lastSavedAt}</b>
                    </span>
                  )}
                </div>

                {saveError && (
                  <div style={{
                    marginTop: 6,
                    padding: 6,
                    border: '1px solid var(--danger)',
                    borderRadius: 8,
                    fontSize: 11
                  }}>
                    ❌ {saveError}
                  </div>
                )}
                <b style={{ color: dirtyCount ? 'var(--warning)' : 'var(--text-muted)' }}>{dirtyCount}</b>
              </div>
            </div>

            <div style={styles.filtersRow}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar (IDP, cidade, telefone, line...)"
                style={styles.input}
              />

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={styles.select}>
                <option value="TODOS">Status: Todos</option>
                <option value="PENDENTES">Status: Pendentes</option>
                <option value="CONCLUIDOS">Status: Concluídos</option>

                <option value="ATENDEU">Status: Atendeu</option>
                <option value="OUTRA_CIDADE">Status: Outra cidade</option>
                <option value="NAO_ATENDEU">Status: Não atendeu</option>

                <option value="CAIXA_POSTAL">Status: Caixa postal</option>
                <option value="SEM_RESPOSTA">Status: Sem resposta</option>
              </select>

              <select value={regiaoFilter} onChange={(e) => setRegiaoFilter(e.target.value)} style={styles.select}>
                <option value="TODAS">Região: Todas</option>
                {regioesDisponiveis.map((rg) => (
                  <option key={rg} value={rg}>
                    Região: {rg}
                  </option>
                ))}
              </select>

              <button
                style={styles.btn}
                onClick={() => {
                  setQ('');
                  setStatusFilter('TODOS');
                  setRegiaoFilter('TODAS');
                }}
              >
                Limpar
              </button>
            </div>

            <div style={styles.pills}>
              <div style={styles.pill}>
                <span style={{ ...styles.dot, background: 'rgba(255,255,255,.55)' }} />
                Pendentes: <b>{pendentes}</b>
              </div>
              <div style={styles.pill}>
                <span style={{ ...styles.dot, background: 'var(--success)' }} />
                Atendeu: <b>{atendeu}</b>
              </div>
              <div style={styles.pill}>
                <span style={{ ...styles.dot, background: 'var(--warning)' }} />
                Outra cidade: <b>{outraCidade}</b>
              </div>
              <div style={styles.pill}>
                <span style={{ ...styles.dot, background: 'var(--warning)' }} />
                Caixa postal: <b>{caixaPostal}</b>
              </div>
              <div style={styles.pill}>
                <span style={{ ...styles.dot, background: 'var(--danger)' }} />
                Não atendeu: <b>{naoAtendeu}</b>
              </div>
              <div style={styles.pill}>
                <span style={{ ...styles.dot, background: 'var(--danger)' }} />
                Sem resposta: <b>{semResposta}</b>
              </div>
            </div>

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
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>Tabela (20 por página)</div>
                <div style={styles.cardSub}>Clique em uma linha para expandir e ver os botões abaixo dela.</div>
              </div>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['STATUS', 'IDP', 'ESTADO', 'CIDADE', 'REGIÃO', 'TF1', 'TF2', 'TF3', 'TF4', 'Nº PESQ.', 'DIA'].map((h) => (
                      <th key={h} style={styles.th}>
                        {h}
                      </th>
                    ))}
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
                        onToggleExpand={() => setExpandedId((cur) => (cur === r.id ? '' : r.id))}
                        onToggleStatus={(next) => toggleStatusForRow(r, next)}
                        onCall={(which) => callPhoneForRow(r, which)}
                      />
                    );
                  })}

                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: 14, color: 'var(--text-muted)', fontSize: 11 }}>
                        Nenhum registro encontrado com esses filtros.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={styles.footerHint}>✅ Clique no mesmo botão novamente para voltar a PENDENTE.</div>
          </div>

          <style>{`
            @media (max-width: 1024px){
              table { min-width: 860px !important; }
            }
            @media (max-width: 820px){
              table { min-width: 780px !important; }
            }
            @media (max-width: 680px){
              table { min-width: 720px !important; }
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
  h1: { fontWeight: 900, fontSize: 13, color: 'var(--text)' },
  sub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },

  filtersRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    maxWidth: 760,
  },

  input: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    padding: '8px 10px',
    borderRadius: 10,
    fontSize: 11,
    outline: 'none',
    minWidth: 220,
  },

  select: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    padding: '8px 10px',
    borderRadius: 10,
    fontSize: 11,
    outline: 'none',
  },

  pills: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  nav: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  pill: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    padding: '6px 8px',
    borderRadius: 999,
    fontSize: 11,
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    border: '1px solid var(--border)',
  },

  btn: {
    border: '1px solid var(--border)',
    background: 'var(--secondary)',
    color: 'var(--secondary-text)',
    padding: '8px 10px',
    borderRadius: 10,
    fontWeight: 900,
    fontSize: 11,
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
  cardTitle: { fontWeight: 900, fontSize: 12, color: 'var(--text)' },
  cardSub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },

  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 920 },
  th: {
    position: 'sticky',
    top: 0,
    background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)',
    padding: '5px 7px',
    fontSize: 10,
    textAlign: 'left',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  tr: { cursor: 'pointer' },
  td: {
    borderBottom: '1px solid var(--border)',
    padding: '5px 7px',
    fontSize: 10,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
  },

  footerHint: {
    padding: 10,
    color: 'var(--text-muted)',
    fontSize: 11,
  },

  btnAction: {
    padding: '5px 9px',
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: 'var(--text)',
  },
  btnActive: {
    outline: '2px solid rgba(255,255,255,.18)',
  },

  actionsInline: {
    padding: 9,
    borderTop: '1px solid var(--border)',
    background: 'var(--surface-2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'nowrap',
  },
  inlineGroup: {
    display: 'flex',
    gap: 8,
    flexWrap: 'nowrap',
    alignItems: 'center',
  },

  finalizeWrap: {
    marginTop: 10,
    padding: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
  },

  finalizeHint: {
    marginTop: 8,
    fontSize: 11,
    color: 'var(--text-muted)',
  },
};