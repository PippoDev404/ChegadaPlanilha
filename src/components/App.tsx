import { useEffect, useMemo, useState } from "react";

type Status = "PENDENTE" | "NAO_ATENDEU" | "OUTRA_CIDADE" | "ATENDEU";

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

  STATUS: Status; // começa PENDENTE
};

const PAGE_SIZE = 20;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function safeTel(v: string) {
  return String(v || "")
    .trim()
    .replace(/[^\d+]/g, "");
}

function statusText(s: Status) {
  if (s === "ATENDEU") return "CONCLUÍDO • ATENDEU";
  if (s === "OUTRA_CIDADE") return "CONCLUÍDO • OUTRA CIDADE";
  if (s === "NAO_ATENDEU") return "CONCLUÍDO • NÃO ATENDEU";
  return "PENDENTE";
}

function statusVars(s: Status) {
  switch (s) {
    case "ATENDEU":
      return { bd: "var(--success)", bg: "rgba(34,197,94,.14)" };
    case "OUTRA_CIDADE":
      return { bd: "var(--warning)", bg: "rgba(245,158,11,.14)" };
    case "NAO_ATENDEU":
      return { bd: "var(--danger)", bg: "rgba(239,68,68,.14)" };
    default:
      return { bd: "var(--border)", bg: "rgba(255,255,255,.06)" };
  }
}

// cor da linha inteira conforme status
function rowBg(status: Status) {
  switch (status) {
    case "NAO_ATENDEU":
      return "rgba(239,68,68,.16)"; // danger
    case "OUTRA_CIDADE":
      return "rgba(245,158,11,.16)"; // warning
    case "ATENDEU":
      return "rgba(34,197,94,.16)"; // success
    default:
      return "transparent";
  }
}

function makeMockRows(total = 137, parte = "P01"): Row[] {
  const estados = ["SP", "RJ", "MG", "PR", "SC"];
  const cidades = ["SANTOS", "SAO VICENTE", "PRAIA GRANDE", "ITANHAEM", "GUARUJA", "CUBATAO"];
  const regioes = ["1", "2", "3", "4", "5"];

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
      TF2: i % 3 === 0 ? "" : `11 9${pad2((i * 2) % 100)}${pad2((i * 4) % 100)}-${pad2((i * 6) % 100)}${pad2((i * 8) % 100)}`,
      TF3: i % 5 === 0 ? "" : `11 9${pad2((i * 9) % 100)}${pad2((i * 1) % 100)}-${pad2((i * 7) % 100)}${pad2((i * 2) % 100)}`,
      TF4: i % 7 === 0 ? "" : `11 9${pad2((i * 5) % 100)}${pad2((i * 8) % 100)}-${pad2((i * 1) % 100)}${pad2((i * 3) % 100)}`,
      N_PESQ: parte,
      DIA_PESQ: "2026-02-13",
      STATUS: "PENDENTE",
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

export default function App() {
  const [allRows, setAllRows] = useState<Row[]>(() => makeMockRows(137, "P01"));
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    return allRows.slice(from, from + PAGE_SIZE);
  }, [allRows, page]);

  const [selectedId, setSelectedId] = useState<string>("");
  const selectedRow = useMemo(() => allRows.find((r) => r.id === selectedId) || null, [allRows, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    if (!allRows.some((r) => r.id === selectedId)) setSelectedId("");
  }, [allRows, selectedId]);

  function updateRow(id: string, patch: Partial<Row>) {
    setAllRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // ✅ Toggle: se clicar no mesmo botão de novo => volta pra pendente
  function toggleStatus(next: Exclude<Status, "PENDENTE">) {
    if (!selectedRow) return;
    const current = selectedRow.STATUS;
    const newStatus: Status = current === next ? "PENDENTE" : next;
    updateRow(selectedRow.id, { STATUS: newStatus });
  }

  // 📞 botão do telefone (não altera status)
  function callPhone(which: "TF1" | "TF2" | "TF3" | "TF4") {
    if (!selectedRow) return;
    const tel = safeTel(selectedRow[which]);
    if (!tel) return;
    window.location.href = `tel:${tel}`;
  }

  const pendentes = useMemo(() => allRows.filter((r) => r.STATUS === "PENDENTE").length, [allRows]);
  const concluidos = useMemo(() => allRows.filter((r) => r.STATUS !== "PENDENTE").length, [allRows]);
  const atendeu = useMemo(() => allRows.filter((r) => r.STATUS === "ATENDEU").length, [allRows]);
  const outraCidade = useMemo(() => allRows.filter((r) => r.STATUS === "OUTRA_CIDADE").length, [allRows]);
  const naoAtendeu = useMemo(() => allRows.filter((r) => r.STATUS === "NAO_ATENDEU").length, [allRows]);

  return (
    <div style={styles.page}>
      <style>{globalCss}</style>

      {/* TOPBAR */}
      <div style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.logo} />
          <div>
            <div style={styles.title}>Mini App — Atendimento</div>
            <div style={styles.subtitle}>
              Lote {allRows[0]?.N_PESQ || "—"} • {allRows.length} registros • Concluídos: <b>{concluidos}</b>
            </div>
          </div>
        </div>

        <div style={styles.pills}>
          <div style={styles.pill}>
            <span style={{ ...styles.dot, background: "rgba(255,255,255,.55)" }} />
            Pendentes: <b>{pendentes}</b>
          </div>
          <div style={styles.pill}>
            <span style={{ ...styles.dot, background: "var(--success)" }} />
            Atendeu: <b>{atendeu}</b>
          </div>
          <div style={styles.pill}>
            <span style={{ ...styles.dot, background: "var(--warning)" }} />
            Outra cidade: <b>{outraCidade}</b>
          </div>
          <div style={styles.pill}>
            <span style={{ ...styles.dot, background: "var(--danger)" }} />
            Não atendeu: <b>{naoAtendeu}</b>
          </div>
        </div>

        <div style={styles.nav}>
          <div style={styles.pill}>
            Página <b>{page}</b>/<b>{totalPages}</b>
          </div>
          <button style={styles.btn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ⬅️ Anterior
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Próxima ➡️
          </button>
        </div>
      </div>

      {/* GRID */}
      <div style={styles.grid} className="grid">
        {/* TABLE */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Tabela (20 por página)</div>
              <div style={styles.cardSub}>Clique em uma linha para abrir o painel lateral. A cor da linha muda conforme o status.</div>
            </div>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["STATUS", "IDP", "ESTADO", "CIDADE", "REGIÃO CIDADE", "TF1", "TF2", "TF3", "TF4", "Nº PESQ.", "DIA PESQ."].map(
                    (h) => (
                      <th key={h} style={styles.th}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const selected = r.id === selectedId;
                  const baseBg = rowBg(r.STATUS);
                  const hoverBg = selected ? "rgba(255,255,255,.08)" : baseBg;

                  return (
                    <tr
                      key={r.id}
                      style={{
                        ...styles.tr,
                        background: selected ? "rgba(255,255,255,.08)" : baseBg,
                        outline: selected ? "1px solid rgba(255,255,255,.18)" : "1px solid transparent",
                      }}
                      onClick={() => setSelectedId(r.id)}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = hoverBg;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = selected ? "rgba(255,255,255,.08)" : baseBg;
                      }}
                    >
                      <td style={styles.td}>
                        <StatusPill status={r.STATUS} />
                      </td>
                      <td style={styles.td}>{r.IDP}</td>
                      <td style={styles.td}>{r.ESTADO || "—"}</td>
                      <td style={styles.td}>{r.CIDADE || "—"}</td>
                      <td style={styles.td}>{r.REGIAO_CIDADE || "—"}</td>
                      <td style={styles.td}>{r.TF1 || "—"}</td>
                      <td style={styles.td}>{r.TF2 || "—"}</td>
                      <td style={styles.td}>{r.TF3 || "—"}</td>
                      <td style={styles.td}>{r.TF4 || "—"}</td>
                      <td style={styles.td}>{r.N_PESQ || "—"}</td>
                      <td style={styles.td}>{r.DIA_PESQ || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={styles.footerHint}>
            ✅ Clique no botão (vermelho/laranja/verde) para marcar como concluído. Clique novamente no mesmo botão para voltar a PENDENTE.
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={styles.sidebar} className="sidebar">
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>Painel do Registro</div>
                <div style={styles.cardSub}>{selectedRow ? `IDP ${selectedRow.IDP}` : "Selecione uma linha na tabela"}</div>
              </div>
            </div>

            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              {!selectedRow ? (
                <div style={styles.muted}>Clique em uma linha para habilitar os botões.</div>
              ) : (
                <>
                  <div style={styles.infoBox}>
                    <div>
                      <b>Status atual:</b> {statusText(selectedRow.STATUS)}
                    </div>
                    <div style={styles.mutedSmall}>
                      <b>Concluído?</b> {selectedRow.STATUS === "PENDENTE" ? "Não" : "Sim"}
                    </div>
                  </div>

                  <button
                    style={{ ...styles.btnAction, ...styles.btnDanger, ...(selectedRow.STATUS === "NAO_ATENDEU" ? styles.btnActive : {}) }}
                    onClick={() => toggleStatus("NAO_ATENDEU")}
                  >
                    🔴 Não atendeu / Caixa postal
                  </button>

                  <button
                    style={{ ...styles.btnAction, ...styles.btnWarning, ...(selectedRow.STATUS === "OUTRA_CIDADE" ? styles.btnActive : {}) }}
                    onClick={() => toggleStatus("OUTRA_CIDADE")}
                  >
                    🟠 Mora / vota em outra cidade
                  </button>

                  <button
                    style={{ ...styles.btnAction, ...styles.btnSuccess, ...(selectedRow.STATUS === "ATENDEU" ? styles.btnActive : {}) }}
                    onClick={() => toggleStatus("ATENDEU")}
                  >
                    🟢 Atendeu
                  </button>

                  <div style={styles.infoBox}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Telefones</div>
                    <PhoneCard label="TF1" value={selectedRow.TF1} onCall={() => callPhone("TF1")} />
                    <PhoneCard label="TF2" value={selectedRow.TF2} onCall={() => callPhone("TF2")} />
                    <PhoneCard label="TF3" value={selectedRow.TF3} onCall={() => callPhone("TF3")} />
                    <PhoneCard label="TF4" value={selectedRow.TF4} onCall={() => callPhone("TF4")} />
                    <div style={styles.mutedSmall}>Se estiver vazio, o botão fica desabilitado.</div>
                  </div>

                  <button
                    style={{ ...styles.btn, ...styles.btnPrimary, width: "100%" }}
                    onClick={() => alert("Depois: aqui vamos enviar tudo pro backend/supabase.")}
                  >
                    ✅ Finalizar (placeholder)
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ ...styles.card, marginTop: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Legenda</div>
            <div style={styles.legendRow}>
              <span style={{ ...styles.dot, background: "rgba(255,255,255,.55)" }} />
              PENDENTE
            </div>
            <div style={styles.legendRow}>
              <span style={{ ...styles.dot, background: "var(--danger)" }} />
              NÃO ATENDEU
            </div>
            <div style={styles.legendRow}>
              <span style={{ ...styles.dot, background: "var(--warning)" }} />
              OUTRA CIDADE
            </div>
            <div style={styles.legendRow}>
              <span style={{ ...styles.dot, background: "var(--success)" }} />
              ATENDEU
            </div>
          </div>
        </div>
      </div>

      {/* Responsivo */}
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

function StatusPill({ status }: { status: Status }) {
  const c = statusVars(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        fontWeight: 900,
        fontSize: 11,
      }}
    >
      {statusText(status)}
    </span>
  );
}

function PhoneCard({ label, value, onCall }: { label: string; value: string; onCall: () => void }) {
  const has = String(value || "").trim().length > 0;
  return (
    <div
      style={{
        marginTop: 8,
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        borderRadius: "var(--radius)",
        padding: "10px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ fontWeight: 900, fontSize: 12, color: "var(--text)" }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{has ? value : "—"}</div>
      </div>
      <button
        disabled={!has}
        onClick={onCall}
        style={{
          border: "1px solid var(--border)",
          background: "var(--secondary)",
          color: "var(--secondary-text)",
          padding: "10px 10px",
          borderRadius: "var(--radius)",
          fontWeight: 900,
          cursor: has ? "pointer" : "not-allowed",
        }}
      >
        📞
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    color: "var(--text)",
  },
  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "rgba(0,0,0,.85)",
    borderBottom: "1px solid var(--border)",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  brand: { display: "flex", alignItems: "center", gap: 12, minWidth: 260 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: "var(--radius)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow)",
  },
  title: { fontWeight: 900, fontSize: 13, letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 },
  pills: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  nav: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },

  pill: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    padding: "8px 10px",
    borderRadius: 999,
    fontSize: 12,
    display: "flex",
    gap: 8,
    alignItems: "center",
    whiteSpace: "nowrap",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    border: "1px solid var(--border)",
  },

  grid: {
    padding: 16,
    display: "grid",
    gridTemplateColumns: "1fr 360px",
    gap: 14,
    alignItems: "start",
  },
  sidebar: { position: "sticky", top: 76 },

  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    overflow: "hidden",
    boxShadow: "var(--shadow)",
  },
  cardHeader: {
    padding: 12,
    borderBottom: "1px solid var(--border)",
    background: "var(--surface-2)",
  },
  cardTitle: { fontWeight: 900, fontSize: 13 },
  cardSub: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 },

  tableWrap: { overflow: "auto" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1100 },
  th: {
    position: "sticky",
    top: 0,
    background: "var(--surface-2)",
    borderBottom: "1px solid var(--border)",
    padding: "10px 10px",
    fontSize: 12,
    textAlign: "left",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  },
  tr: {
    cursor: "pointer",
  },
  td: {
    borderBottom: "1px solid var(--border)",
    padding: "10px 10px",
    fontSize: 12,
    color: "var(--text)",
    whiteSpace: "nowrap",
  },

  footerHint: {
    padding: 12,
    color: "var(--text-muted)",
    fontSize: 12,
  },

  muted: {
    color: "var(--text-muted)",
    fontSize: 12,
    padding: 10,
  },
  mutedSmall: {
    color: "var(--text-muted)",
    fontSize: 11,
    marginTop: 6,
  },

  infoBox: {
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    borderRadius: "var(--radius)",
    padding: 12,
    fontSize: 12,
  },

  btn: {
    border: "1px solid var(--border)",
    background: "var(--secondary)",
    color: "var(--secondary-text)",
    padding: "10px 12px",
    borderRadius: "var(--radius)",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
  },
  btnPrimary: {
    background: "var(--primary)",
    color: "var(--primary-text)",
    borderColor: "var(--border)",
  },
  btnAction: {
    width: "100%",
    textAlign: "left",
    padding: "12px 12px",
  },
  btnDanger: {
    border: "1px solid rgba(239,68,68,.45)",
    background: "rgba(239,68,68,.14)",
    color: "var(--text)",
  },
  btnWarning: {
    border: "1px solid rgba(245,158,11,.45)",
    background: "rgba(245,158,11,.14)",
    color: "var(--text)",
  },
  btnSuccess: {
    border: "1px solid rgba(34,197,94,.45)",
    background: "rgba(34,197,94,.14)",
    color: "var(--text)",
  },
  btnActive: {
    outline: "2px solid rgba(255,255,255,.18)",
  },

  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 0",
    color: "var(--text-muted)",
    fontSize: 12,
  },
};