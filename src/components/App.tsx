import { Navigate, Route, Routes, HashRouter } from 'react-router-dom';
import { useLaunchParams, useSignal, miniApp } from '@tma.js/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';

import { routes } from '@/navigation/routes.tsx';
import { useEffect, useMemo, useState } from 'react';

type Status = 'PENDENTE' | 'NAO_ATENDEU' | 'OUTRA_CIDADE' | 'ATENDEU';

type Row = {
  id: string;
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
};

const PAGE_SIZE = 20;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function safeTel(v: string) {
  return String(v || '').trim().replace(/[^\d+]/g, '');
}

function statusText(s: Status) {
  if (s === 'ATENDEU') return 'CONCLUÍDO • ATENDEU';
  if (s === 'OUTRA_CIDADE') return 'CONCLUÍDO • OUTRA CIDADE';
  if (s === 'NAO_ATENDEU') return 'CONCLUÍDO • NÃO ATENDEU';
  return 'PENDENTE';
}

function statusVars(s: Status) {
  switch (s) {
    case 'ATENDEU':
      return { bd: 'var(--success)', bg: 'rgba(34,197,94,.14)' };
    case 'OUTRA_CIDADE':
      return { bd: 'var(--warning)', bg: 'rgba(245,158,11,.14)' };
    case 'NAO_ATENDEU':
      return { bd: 'var(--danger)', bg: 'rgba(239,68,68,.14)' };
    default:
      return { bd: 'var(--border)', bg: 'rgba(255,255,255,.06)' };
  }
}

function rowBg(status: Status) {
  switch (status) {
    case 'NAO_ATENDEU':
      return 'rgba(239,68,68,.16)';
    case 'OUTRA_CIDADE':
      return 'rgba(245,158,11,.16)';
    case 'ATENDEU':
      return 'rgba(34,197,94,.16)';
    default:
      return 'transparent';
  }
}

function makeMockRows(total = 137, parte = 'P01'): Row[] {
  const estados = ['SP', 'RJ', 'MG', 'PR', 'SC'];
  const cidades = ['SANTOS', 'SAO VICENTE', 'PRAIA GRANDE', 'ITANHAEM', 'GUARUJA', 'CUBATAO'];
  const regioes = ['1', '2', '3', '4', '5'];

  const out: Row[] = [];
  for (let i = 1; i <= total; i++) {
    const est = estados[i % estados.length];
    const cid = cidades[i % cidades.length];
    const reg = regioes[i % regioes.length];

    const tfBase = `11 9${pad2((i * 7) % 100)}${pad2((i * 3) % 100)}-${pad2((i * 5) % 100)}${pad2((i * 9) % 100)}`;

    out.push({
      id: `row-${i}`,
      IDP: String(100000 + i),
      ESTADO: est,
      CIDADE: cid,
      REGIAO_CIDADE: reg,
      TF1: tfBase,
      TF2: i % 3 === 0 ? '' : `11 9${pad2((i * 2) % 100)}${pad2((i * 4) % 100)}-${pad2((i * 6) % 100)}${pad2((i * 8) % 100)}`,
      TF3: i % 5 === 0 ? '' : `11 9${pad2((i * 9) % 100)}${pad2((i * 1) % 100)}-${pad2((i * 7) % 100)}${pad2((i * 2) % 100)}`,
      TF4: i % 7 === 0 ? '' : `11 9${pad2((i * 5) % 100)}${pad2((i * 8) % 100)}-${pad2((i * 1) % 100)}${pad2((i * 3) % 100)}`,
      N_PESQ: parte,
      DIA_PESQ: '2026-02-13',
      STATUS: 'PENDENTE',
    });
  }
  return out;
}

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
  --primary-hover: #e2e2e2;

  --secondary: #1A1A1A;
  --secondary-text: #FFFFFF;
  --secondary-hover: #2A2A2A;

  --success: #22C55E;
  --warning: #F59E0B;
  --danger:  #EF4444;

  --shadow: 0 10px 30px rgba(0,0,0,.35);
  --radius: 15px;
}
body{
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #000000 0%, #0a0a0a 100%);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 0;
  margin: 0;
}
*{ box-sizing: border-box; }
button:disabled{ opacity: .55; cursor: not-allowed !important; }
`;

function StatusPill({ status }: { status: Status }) {
  const c = statusVars(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        fontWeight: 900,
        fontSize: 11,
        color: 'var(--text)',
      }}
    >
      {statusText(status)}
    </span>
  );
}

function PhoneCard({ label, value, onCall }: { label: string; value: string; onCall: () => void }) {
  const has = String(value || '').trim().length > 0;
  return (
    <div
      style={{
        marginTop: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius)',
        padding: '10px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ display: 'grid', gap: 2 }}>
        <div style={{ fontWeight: 900, fontSize: 12, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{has ? value : '—'}</div>
      </div>
      <button
        disabled={!has}
        onClick={onCall}
        style={{
          border: '1px solid var(--border)',
          background: 'var(--secondary)',
          color: 'var(--secondary-text)',
          padding: '10px 10px',
          borderRadius: 'var(--radius)',
          fontWeight: 900,
          cursor: has ? 'pointer' : 'not-allowed',
        }}
      >
        📞
      </button>
    </div>
  );
}

// ✅ Página (para usar como rota "/")
function MiniAppTabela() {
  const [allRows, setAllRows] = useState<Row[]>(() => makeMockRows(137, 'P01'));
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    return allRows.slice(from, from + PAGE_SIZE);
  }, [allRows, page]);

  const [selectedId, setSelectedId] = useState<string>('');
  const selectedRow = useMemo(() => allRows.find((r) => r.id === selectedId) || null, [allRows, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    if (!allRows.some((r) => r.id === selectedId)) setSelectedId('');
  }, [allRows, selectedId]);

  function updateRow(id: string, patch: Partial<Row>) {
    setAllRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // ✅ Toggle: clicar de novo no mesmo botão => volta pra PENDENTE
  function toggleStatus(next: Exclude<Status, 'PENDENTE'>) {
    if (!selectedRow) return;
    const current = selectedRow.STATUS;
    const newStatus: Status = current === next ? 'PENDENTE' : next;
    updateRow(selectedRow.id, { STATUS: newStatus });
  }

  function callPhone(which: 'TF1' | 'TF2' | 'TF3' | 'TF4') {
    if (!selectedRow) return;
    const tel = safeTel(selectedRow[which]);
    if (!tel) return;
    window.location.href = `tel:${tel}`;
  }

  const pendentes = useMemo(() => allRows.filter((r) => r.STATUS === 'PENDENTE').length, [allRows]);
  const concluidos = useMemo(() => allRows.filter((r) => r.STATUS !== 'PENDENTE').length, [allRows]);

  const atendeu = useMemo(() => allRows.filter((r) => r.STATUS === 'ATENDEU').length, [allRows]);
  const outraCidade = useMemo(() => allRows.filter((r) => r.STATUS === 'OUTRA_CIDADE').length, [allRows]);
  const naoAtendeu = useMemo(() => allRows.filter((r) => r.STATUS === 'NAO_ATENDEU').length, [allRows]);

  return (
    <div style={{ padding: 16 }}>
      <style>{globalCss}</style>

      {/* TOPBAR LOCAL */}
      <div style={styles.topbarLocal}>
        <div>
          <div style={styles.h1}>Atendimento</div>
          <div style={styles.sub}>
            Lote {allRows[0]?.N_PESQ || '—'} • {allRows.length} registros • Concluídos: <b>{concluidos}</b>
          </div>
        </div>

        <div style={styles.pills}>
          <Pill dot="rgba(255,255,255,.55)" label="Pendentes" value={pendentes} />
          <Pill dot="var(--success)" label="Atendeu" value={atendeu} />
          <Pill dot="var(--warning)" label="Outra cidade" value={outraCidade} />
          <Pill dot="var(--danger)" label="Não atendeu" value={naoAtendeu} />
        </div>

        <div style={styles.nav}>
          <div style={styles.pill}>
            Página <b>{page}</b>/<b>{totalPages}</b>
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

      {/* GRID */}
      <div style={styles.grid} className="grid">
        {/* TABELA */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Tabela (20 por página)</div>
              <div style={styles.cardSub}>A cor da linha muda conforme o status. Clique para abrir o painel.</div>
            </div>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['STATUS', 'IDP', 'ESTADO', 'CIDADE', 'REGIÃO CIDADE', 'TF1', 'TF2', 'TF3', 'TF4', 'Nº PESQ.', 'DIA PESQ.'].map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const selected = r.id === selectedId;
                  const baseBg = rowBg(r.STATUS);

                  return (
                    <tr
                      key={r.id}
                      style={{
                        ...styles.tr,
                        background: selected ? 'rgba(255,255,255,.07)' : baseBg,
                        outline: selected ? '1px solid rgba(255,255,255,.18)' : '1px solid transparent',
                      }}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td style={styles.td}>
                        <StatusPill status={r.STATUS} />
                      </td>
                      <td style={styles.td}>{r.IDP}</td>
                      <td style={styles.td}>{r.ESTADO || '—'}</td>
                      <td style={styles.td}>{r.CIDADE || '—'}</td>
                      <td style={styles.td}>{r.REGIAO_CIDADE || '—'}</td>
                      <td style={styles.td}>{r.TF1 || '—'}</td>
                      <td style={styles.td}>{r.TF2 || '—'}</td>
                      <td style={styles.td}>{r.TF3 || '—'}</td>
                      <td style={styles.td}>{r.TF4 || '—'}</td>
                      <td style={styles.td}>{r.N_PESQ || '—'}</td>
                      <td style={styles.td}>{r.DIA_PESQ || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={styles.footerHint}>✅ Clique no botão (vermelho/laranja/verde) para concluir. Clique de novo no mesmo botão para voltar a PENDENTE.</div>
        </div>

        {/* PAINEL DIREITO */}
        <div style={styles.sidebar} className="sidebar">
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>Painel do Registro</div>
                <div style={styles.cardSub}>{selectedRow ? `IDP ${selectedRow.IDP}` : 'Selecione uma linha na tabela'}</div>
              </div>
            </div>

            <div style={{ padding: 12, display: 'grid', gap: 10 }}>
              {!selectedRow ? (
                <div style={styles.muted}>Clique em uma linha para habilitar os botões.</div>
              ) : (
                <>
                  <div style={styles.infoBox}>
                    <div>
                      <b>Status atual:</b> {statusText(selectedRow.STATUS)}
                    </div>
                    <div style={styles.mutedSmall}>
                      <b>Concluído?</b> {selectedRow.STATUS === 'PENDENTE' ? 'Não' : 'Sim'}
                    </div>
                  </div>

                  <button
                    style={{ ...styles.btnAction, ...styles.btnDanger, ...(selectedRow.STATUS === 'NAO_ATENDEU' ? styles.btnActive : {}) }}
                    onClick={() => toggleStatus('NAO_ATENDEU')}
                  >
                    🔴 Não atendeu / Caixa postal
                  </button>

                  <button
                    style={{ ...styles.btnAction, ...styles.btnWarning, ...(selectedRow.STATUS === 'OUTRA_CIDADE' ? styles.btnActive : {}) }}
                    onClick={() => toggleStatus('OUTRA_CIDADE')}
                  >
                    🟠 Mora / vota em outra cidade
                  </button>

                  <button
                    style={{ ...styles.btnAction, ...styles.btnSuccess, ...(selectedRow.STATUS === 'ATENDEU' ? styles.btnActive : {}) }}
                    onClick={() => toggleStatus('ATENDEU')}
                  >
                    🟢 Atendeu
                  </button>

                  <div style={styles.infoBox}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Telefones</div>
                    <PhoneCard label="TF1" value={selectedRow.TF1} onCall={() => callPhone('TF1')} />
                    <PhoneCard label="TF2" value={selectedRow.TF2} onCall={() => callPhone('TF2')} />
                    <PhoneCard label="TF3" value={selectedRow.TF3} onCall={() => callPhone('TF3')} />
                    <PhoneCard label="TF4" value={selectedRow.TF4} onCall={() => callPhone('TF4')} />
                    <div style={styles.mutedSmall}>Se estiver vazio, o botão fica desabilitado.</div>
                  </div>

                  <button style={{ ...styles.btn, ...styles.btnPrimary, width: '100%' }} onClick={() => alert('Depois: aqui vamos enviar pro backend/supabase.')}>
                    ✅ Finalizar (placeholder)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 980px){
          .grid { grid-template-columns: 1fr !important; }
          .sidebar { position: relative !important; top: auto !important; }
          table { min-width: 1000px; }
        }
      `}</style>
    </div>
  );
}

function Pill({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div style={styles.pill}>
      <span style={{ ...styles.dot, background: dot }} />
      {label}: <b>{value}</b>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topbarLocal: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: 14,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  h1: { fontWeight: 900, fontSize: 16, color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },

  pills: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  nav: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  pill: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    padding: '8px 10px',
    borderRadius: 999,
    fontSize: 12,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    border: '1px solid var(--border)',
  },

  btn: {
    border: '1px solid var(--border)',
    background: 'var(--secondary)',
    color: 'var(--secondary-text)',
    padding: '10px 12px',
    borderRadius: 'var(--radius)',
    fontWeight: 900,
    fontSize: 12,
    cursor: 'pointer',
  },
  btnPrimary: {
    background: 'var(--primary)',
    color: 'var(--primary-text)',
    borderColor: 'var(--border)',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 360px',
    gap: 14,
    alignItems: 'start',
  },
  sidebar: { position: 'sticky', top: 16 },

  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow)',
  },
  cardHeader: {
    padding: 12,
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface-2)',
  },
  cardTitle: { fontWeight: 900, fontSize: 13, color: 'var(--text)' },
  cardSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },

  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1100 },
  th: {
    position: 'sticky',
    top: 0,
    background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)',
    padding: '10px 10px',
    fontSize: 12,
    textAlign: 'left',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  tr: { cursor: 'pointer' },
  td: {
    borderBottom: '1px solid var(--border)',
    padding: '10px 10px',
    fontSize: 12,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
  },

  footerHint: {
    padding: 12,
    color: 'var(--text-muted)',
    fontSize: 12,
  },

  muted: { color: 'var(--text-muted)', fontSize: 12, padding: 10 },
  mutedSmall: { color: 'var(--text-muted)', fontSize: 11, marginTop: 6 },

  infoBox: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    borderRadius: 'var(--radius)',
    padding: 12,
    fontSize: 12,
    color: 'var(--text)',
  },

  btnAction: {
    width: '100%',
    textAlign: 'left',
    padding: '12px 12px',
    borderRadius: 'var(--radius)',
    fontWeight: 900,
    cursor: 'pointer',
  },
  btnDanger: {
    border: '1px solid rgba(239,68,68,.45)',
    background: 'rgba(239,68,68,.14)',
    color: 'var(--text)',
  },
  btnWarning: {
    border: '1px solid rgba(245,158,11,.45)',
    background: 'rgba(245,158,11,.14)',
    color: 'var(--text)',
  },
  btnSuccess: {
    border: '1px solid rgba(34,197,94,.45)',
    background: 'rgba(34,197,94,.14)',
    color: 'var(--text)',
  },
  btnActive: {
    outline: '2px solid rgba(255,255,255,.18)',
  },
};

// ✅ Mantém seu App original e adiciona a página como rota "/" sem quebrar nada
export function App() {
  const lp = useLaunchParams();
  const isDark = useSignal(miniApp.isDark);

  // garante “dark” sempre no telegram-ui (se quiser travar em dark, pode simplificar)
  const appearance = isDark ? 'dark' : 'dark';

  return (
    <AppRoot appearance={appearance} platform={['macos', 'ios'].includes(lp.tgWebAppPlatform) ? 'ios' : 'base'}>
      <style>{globalCss}</style>
      <HashRouter>
        <Routes>
          {/* ✅ nossa página nova na "/" */}
          <Route path="/" element={<MiniAppTabela />} />

          {/* ✅ mantém suas rotas existentes */}
          {routes.map((route) => (
            <Route key={route.path} {...route} />
          ))}

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </HashRouter>
    </AppRoot>
  );
}