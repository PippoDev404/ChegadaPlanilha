import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

type Status =
  | 'PENDENTE'
  | 'NAO_ATENDEU'
  | 'OUTRA_CIDADE'
  | 'ATENDEU'
  | 'CAIXA_POSTAL' // compat
  | 'LIGAR_MAIS_TARDE'
  | 'NUMERO_NAO_EXISTE';

type PartePayload = {
  telegram_id?: string;
  telegram_username?: string;
  categoria?: string;
  chave_parte?: string;
  total_linhas?: number;
  tamanho_bytes?: number;
  csv?: string;
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
};

type StatusFilter = 'TODOS' | 'PENDENTES' | 'CONCLUIDOS' | Status;

const PAGE_SIZE = 20;

// Ajuste se o seu n8n tiver outro path
const API_GET_ENTREGA = 'https://n8n.srv962474.hstgr.cloud/webhook/entregas';
const API_SAVE_PARTE = 'https://n8n.srv962474.hstgr.cloud/webhook/parte/salvar';

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

function normalizeParam(v: string | null | undefined): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.toLowerCase() === 'undefined') return '';
  if (s.toLowerCase() === 'null') return '';
  return s;
}

function getHashSearchParams(): URLSearchParams {
  // HashRouter usa window.location.hash tipo: "#/?entregaId=...&parte=P01"
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex < 0) return new URLSearchParams();
  const qs = hash.slice(qIndex + 1); // tudo depois do ?
  return new URLSearchParams(qs);
}

function getEntregaPkFromUrl(): string {
  const url = new URL(window.location.href);

  // 1) Query normal: https://site.com/?entregaId=...
  const sp = url.searchParams;
  const direct =
    normalizeParam(sp.get('entregaId')) ||
    normalizeParam(sp.get('entrega_id')) ||
    normalizeParam(sp.get('id'));

  if (direct) return direct;

  // 2) Query no hash: https://site.com/#/?entregaId=...
  const hp = getHashSearchParams();
  const fromHash =
    normalizeParam(hp.get('entregaId')) ||
    normalizeParam(hp.get('entrega_id')) ||
    normalizeParam(hp.get('id'));

  return fromHash || '';
}

function getParteFromUrl(): string {
  const url = new URL(window.location.href);

  // 1) Query normal
  const sp = url.searchParams;
  const direct =
    normalizeParam(sp.get('parte')) ||
    normalizeParam(sp.get('chave_parte'));

  if (direct) return direct;

  // 2) Query no hash
  const hp = getHashSearchParams();
  const fromHash =
    normalizeParam(hp.get('parte')) ||
    normalizeParam(hp.get('chave_parte'));

  return fromHash || '';
}

function getTelegramIdStrict(): string {
  const w: any = window as any;
  const tgId = w?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgId ? String(tgId) : '';
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
    case 'CAIXA_POSTAL':
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
        fontSize: 11,
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
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{
          border: '1px solid var(--border)',
          background: disabled ? 'var(--surface)' : 'var(--primary)',
          color: disabled ? 'var(--text-muted)' : 'var(--primary-text)',
          padding: '7px 12px',
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

      {/* ✅ copiar SOMENTE telefone */}
      <button
        disabled={!value}
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
        style={{
          border: '1px solid rgba(255,255,255,.18)',
          background: 'rgba(255,255,255,.06)',
          color: 'var(--text)',
          padding: '7px 10px',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 900,
          cursor: !value ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
        title={value ? `Copiar ${label}` : ''}
      >
        📋
      </button>
    </div>
  );
}
function RowActions({
  row,
  onToggleStatus,
  onCall,
  onSetObsForOutraCidade,
  onCopyPhone,
}: {
  row: Row;
  onToggleStatus: (next: Exclude<Status, 'PENDENTE'>) => void;
  onCall: (which: 'TF1' | 'TF2') => void;
  onSetObsForOutraCidade: () => void;
  onCopyPhone: (which: 'TF1' | 'TF2') => void;
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

        {/* ✅ OUTRA CIDADE com POPUP */}
        <ActionButton
          active={row.STATUS === 'OUTRA_CIDADE'}
          kind="warning"
          onClick={() => {
            // se está indo para OUTRA_CIDADE, abre popup (e salva observação)
            if (row.STATUS !== 'OUTRA_CIDADE') onSetObsForOutraCidade();
            onToggleStatus('OUTRA_CIDADE');
          }}
        >
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
        <MiniTel label="TF1" value={row.TF1} disabled={!tf1} onClick={() => onCall('TF1')} onCopy={() => onCopyPhone('TF1')} />
        <MiniTel label="TF2" value={row.TF2} disabled={!tf2} onClick={() => onCall('TF2')} onCopy={() => onCopyPhone('TF2')} />
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
  onCopyIdp,
  onSetObsForOutraCidade,
  onCopyPhone,
}: {
  row: Row;
  isExpanded: boolean;
  baseBg: string;
  onToggleExpand: () => void;
  onToggleStatus: (next: Exclude<Status, 'PENDENTE'>) => void;
  onCall: (which: 'TF1' | 'TF2') => void;
  geoCols: { estado: boolean; cidade: boolean; regiao: boolean };
  onCopyIdp: () => void;
  onSetObsForOutraCidade: () => void;
  onCopyPhone: (which: 'TF1' | 'TF2') => void;
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

        {/* ✅ COPIAR SOMENTE IDP */}
        <td
          style={{ ...styles.td, cursor: 'copy' }}
          title="Clique para copiar IDP"
          onClick={(e) => {
            e.stopPropagation();
            onCopyIdp();
          }}
        >
          {row.IDP}
        </td>

        {/* ❌ SEM COPIAR nessas colunas */}
        {geoCols.estado ? <td style={styles.td}>{row.ESTADO || '—'}</td> : null}
        {geoCols.cidade ? <td style={styles.td}>{row.CIDADE || '—'}</td> : null}
        {geoCols.regiao ? <td style={styles.td}>{row.REGIAO_CIDADE || '—'}</td> : null}

        <td style={styles.td}>{row.TF1 || '—'}</td>
        <td style={styles.td}>{row.TF2 || '—'}</td>
      </tr>

      {isExpanded ? (
        <tr style={{ background: 'var(--surface-2)' }}>
          <td
            colSpan={2 + (geoCols.estado ? 1 : 0) + (geoCols.cidade ? 1 : 0) + (geoCols.regiao ? 1 : 0) + 2}
            style={{ padding: 0, borderBottom: '1px solid var(--border)' }}
          >
            <RowActions
              row={row}
              onToggleStatus={onToggleStatus}
              onCall={onCall}
              onSetObsForOutraCidade={onSetObsForOutraCidade}
              onCopyPhone={onCopyPhone}
            />
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

  const [toast, setToast] = useState<string>('');

  // alterações pendentes (LINE => {STATUS, OBSERVACAO})
  const [dirty, setDirty] = useState<Record<string, { STATUS: Status; OBSERVACAO: string }>>({});
  const dirtyCount = useMemo(() => Object.keys(dirty).length, [dirty]);

  // 1) FETCH payload por entregaId (PK)
  useEffect(() => {
    const entregaId = getEntregaPkFromUrl();

    if (!entregaId) {
      setError('URL sem entregaId. Abra pelo link com #/?entregaId=...&parte=...');
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError('');
        setPayload(null);

        const url = `${API_GET_ENTREGA}?id=${encodeURIComponent(entregaId)}`;
        const resp = await fetch(url, { cache: 'no-store' });

        const raw = await resp.text().catch(() => '');
        if (!resp.ok) throw new Error(`HTTP ${resp.status} • ${raw || 'Sem body'}`);

        if (!raw.trim()) {
          throw new Error('Servidor respondeu vazio (sem JSON). Verifique o webhook /entregas no n8n.');
        }

        let data: any;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(`Resposta não é JSON. Body (início): ${raw.slice(0, 300)}`);
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

  // 2) opcional: payload via evento
  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent;
      const data = ce?.detail;
      if (Array.isArray(data)) setPayload(data);
    };
    window.addEventListener('IBESPE_PAYLOAD', handler as any);
    return () => window.removeEventListener('IBESPE_PAYLOAD', handler as any);
  }, []);

  // 3) Quando payload chegar, preenche rows/parte
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

  /**
   * ✅ Atualiza "dirty" para autosave:
   * sempre que alterar status OU observação
   */
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

  function toggleStatusForRow(row: Row, next: Exclude<Status, 'PENDENTE'>) {
    const newStatus: Status = row.STATUS === next ? 'PENDENTE' : next;
    updateRow(row.id, { STATUS: newStatus });
    markDirty(row, { STATUS: newStatus });
  }

  /**
   * ✅ Quando clicar em OUTRA_CIDADE e estiver mudando pra OUTRA_CIDADE:
   * abre popup e salva em OBSERVACAO
   */
  function askOutraCidadeObs(row: Row) {
    const current = String(row.OBSERVACAO || '').trim();
    const val = window.prompt('Qual cidade?', current || '');
    if (val === null) return; // cancelou
    const cleaned = String(val || '').trim();
    updateRow(row.id, { OBSERVACAO: cleaned });
    markDirty(row, { OBSERVACAO: cleaned });
  }

  // AUTOSAVE (debounce 800ms)
  useEffect(() => {
    const entrega_id = getEntregaPkFromUrl();
    const telegram_id = getTelegramIdStrict();
    const parteUrl = getParteFromUrl() || parte || (payload?.[0]?.chave_parte ? String(payload[0].chave_parte) : '');

    if (!entrega_id || !parteUrl) return;

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
          body: JSON.stringify({
            entrega_id,
            telegram_id,
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
        if (msg.toLowerCase().includes('failed to fetch')) {
          setSaveError(
            'Failed to fetch — normalmente é CORS, URL do webhook errada, SSL ou o endpoint /parte/salvar não está publicado/ativo no n8n. Verifique Network/Console.'
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

  const pendentes = useMemo(() => filteredRows.filter((r) => r.STATUS === 'PENDENTE').length, [filteredRows]);
  const concluidos = useMemo(() => filteredRows.filter((r) => r.STATUS !== 'PENDENTE').length, [filteredRows]);
  const hasData = allRows.length > 0;

  const hintLink = useMemo(() => {
    const base = `${window.location.origin}${window.location.pathname}#/?`;
    return `${base}entregaId=SEU_ENTREGA_ID&parte=P03`;
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
            <div style={{ fontWeight: 900, fontSize: 14 }}>{loading ? 'Carregando…' : 'Aguardando dados…'}</div>

            <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 12 }}>
              {loading ? 'Buscando o CSV no servidor (n8n → Supabase).' : 'Abra com entregaId para carregar. Exemplo:'}
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
                }}
              >
                {hintLink}
              </div>
            )}

            {error ? (
              <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--danger)', borderRadius: 10 }}>
                <div style={{ fontWeight: 900 }}>⚠️ Erro</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{error}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
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

              {toast && (
                <div style={{ marginTop: 8, padding: 10, border: '1px solid rgba(255,255,255,.18)', borderRadius: 10, fontSize: 12 }}>
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

            <PaginationControls />
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>Tabela (20 por página)</div>
                <div style={styles.cardSub}>Clique na linha para expandir. Copiar só em IDP e telefones.</div>
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
                        onCopyIdp={() => copyToClipboard('IDP', r.IDP)}
                        onSetObsForOutraCidade={() => askOutraCidadeObs(r)}
                        onCopyPhone={(which) => copyToClipboard(which, r[which])}
                      />
                    );
                  })}

                  {pageRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2 + (geoCols.estado ? 1 : 0) + (geoCols.cidade ? 1 : 0) + (geoCols.regiao ? 1 : 0) + 2}
                        style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}
                      >
                        Nenhum registro encontrado com esses filtros.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={styles.footerHint}>✅ Clique no mesmo botão novamente para voltar a PENDENTE.</div>

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
    background: 'var(--surface-2)',
    color: 'var(--text)',
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 13,
    outline: 'none',
  },

  nav: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  pill: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
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
    background: 'var(--surface-2)',
  },
  cardTitle: { fontWeight: 900, fontSize: 14, color: 'var(--text)' },
  cardSub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },

  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 860 },
  th: {
    position: 'sticky',
    top: 0,
    background: 'var(--surface-2)',
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
  },

  footerHint: {
    padding: 10,
    color: 'var(--text-muted)',
    fontSize: 13,
  },

  btnAction: {
    padding: '9px 12px',
    borderRadius: 10,
    fontSize: 12,
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