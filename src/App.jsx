import React, { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, enableAuthPersistence } from "./firebase";

const POINT_GOAL = 50000;
const CASE_GOAL = 40;
const DEADLINE = new Date("2026-11-05T23:59:59");
const milestoneLevels = [10000, 25000, 40000, 50000];
const ENTRIES_COLLECTION = "entries";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function calcPoints(annualPremium) {
  return Number(annualPremium || 0) * 0.5;
}

function getDaysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function getMonthKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const out = new Date(d);
  out.setDate(diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const start = startOfWeek(d);
  return start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function cardStyle(extra = {}) {
  return {
    background: "rgba(255,255,255,0.94)",
    borderRadius: 24,
    padding: 18,
    boxShadow: "0 18px 44px rgba(15,23,42,0.08)",
    border: "1px solid rgba(255,255,255,0.8)",
    backdropFilter: "blur(12px)",
    ...extra,
  };
}

function StatCard({ title, value, subtitle, emoji, gradient }) {
  return (
    <div style={cardStyle({ position: "relative", overflow: "hidden" })}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: gradient }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: "#64748b" }}>{title}</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: "#0f172a" }}>{value}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{subtitle}</div>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 16, background: gradient, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 20, flexShrink: 0 }}>
          {emoji}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value, color, track }) {
  return (
    <div style={{ width: "100%", height: 12, background: track, borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}

function SegmentedTabs({ value, onChange, options }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 8, background: "rgba(255,255,255,0.92)", padding: 6, borderRadius: 18, boxShadow: "0 8px 20px rgba(15,23,42,0.06)" }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button key={option.value} onClick={() => onChange(option.value)} style={{ border: "none", borderRadius: 14, padding: "10px 12px", background: active ? "#111827" : "transparent", color: active ? "white" : "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MiniChart({ data, dataKey, color = "#2563eb" }) {
  const width = 320;
  const height = 180;
  const padding = 18;
  const maxValue = Math.max(1, ...data.map((item) => Number(item[dataKey] || 0)));
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  if (!data.length) {
    return <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 14 }}>No data yet.</div>;
  }

  const points = data.map((item, index) => {
    const x = padding + (innerWidth / Math.max(1, data.length - 1)) * index;
    const y = padding + innerHeight - (Number(item[dataKey] || 0) / maxValue) * innerHeight;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 180 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = padding + innerHeight * step;
          return <line key={step} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />;
        })}
        <polyline fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={points} />
        {data.map((item, index) => {
          const x = padding + (innerWidth / Math.max(1, data.length - 1)) * index;
          const y = padding + innerHeight - (Number(item[dataKey] || 0) / maxValue) * innerHeight;
          return (
            <g key={item.label}>
              <circle cx={x} cy={y} r="4.5" fill={color} />
              <text x={x} y={height - 4} textAnchor="middle" fontSize="10" fill="#64748b">{item.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>{label}</label>
      {children}
      {hint ? <div style={{ fontSize: 12, color: "#64748b" }}>{hint}</div> : null}
    </div>
  );
}

function InputField(props) {
  return <input {...props} style={{ width: "100%", boxSizing: "border-box", borderRadius: 16, border: "1px solid #dbeafe", padding: "14px 14px", fontSize: 16, outline: "none", background: "rgba(255,255,255,0.98)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)", ...props.style }} />;
}

function TextareaField(props) {
  return <textarea {...props} style={{ width: "100%", boxSizing: "border-box", borderRadius: 16, border: "1px solid #dbeafe", padding: "14px 14px", fontSize: 16, minHeight: 90, outline: "none", resize: "vertical", background: "rgba(255,255,255,0.98)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)", ...props.style }} />;
}

function PrimaryButton({ children, style, ...props }) {
  return <button {...props} style={{ width: "100%", border: "none", borderRadius: 18, padding: "15px 18px", background: "linear-gradient(135deg,#1d4ed8,#0f766e)", color: "white", fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em", cursor: "pointer", boxShadow: "0 14px 28px rgba(29,78,216,0.24)", ...style }}>{children}</button>;
}

function SmallButton({ children, background, color = "#0f172a", ...props }) {
  return <button {...props} style={{ flex: 1, border: "none", borderRadius: 12, padding: "10px 12px", background, color, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 8px 18px rgba(15,23,42,0.06)" }}>{children}</button>;
}

function MobileNav({ currentTab, setCurrentTab }) {
  const items = [
    { key: "dashboard", label: "Home", emoji: "🏠" },
    { key: "entry", label: "New", emoji: "➕" },
    { key: "charts", label: "Charts", emoji: "📈" },
  ];

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.82)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.8)", padding: 12 }}>
      <div style={{ maxWidth: 420, margin: "0 auto", display: "flex", gap: 10, justifyContent: "space-between" }}>
        {items.map((item) => {
          const active = currentTab === item.key;
          return (
            <button key={item.key} onClick={() => setCurrentTab(item.key)} style={{ flex: 1, border: "none", borderRadius: 18, padding: "10px 8px", background: active ? "#111827" : "transparent", color: active ? "white" : "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{item.emoji}</div>
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AuthScreen({
  name,
  setName,
  email,
  password,
  setEmail,
  setPassword,
  authMode,
  setAuthMode,
  onSubmit,
  authError,
  authLoading,
}) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at top left,#dbeafe 0%,#eff6ff 34%,#ecfeff 68%,#f8fafc 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, ...cardStyle({ padding: 28 }) }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{authMode === "signin" ? "Sign in" : "Create account"}</div>
        <div style={{ marginTop: 8, color: "#64748b", fontSize: 14 }}>Sign in once per device and your progress will stay synced.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 18, marginBottom: 18 }}>
          <button onClick={() => setAuthMode("signin")} style={{ border: "none", borderRadius: 14, padding: "10px 12px", background: authMode === "signin" ? "#111827" : "#f8fafc", color: authMode === "signin" ? "white" : "#475569", fontWeight: 700, cursor: "pointer" }}>Sign in</button>
          <button onClick={() => setAuthMode("signup")} style={{ border: "none", borderRadius: 14, padding: "10px 12px", background: authMode === "signup" ? "#111827" : "#f8fafc", color: authMode === "signup" ? "white" : "#475569", fontWeight: 700, cursor: "pointer" }}>Sign up</button>
        </div>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {authMode === "signup" ? (
            <Field label="Name">
              <InputField type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
            </Field>
          ) : null}
          <Field label="Email"><InputField type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></Field>
          <Field label="Password"><InputField type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required /></Field>
          {authError ? <div style={{ fontSize: 13, color: "#dc2626" }}>{authError}</div> : null}
          <PrimaryButton type="submit">{authLoading ? "Please wait..." : authMode === "signin" ? "Sign in" : "Create account"}</PrimaryButton>
        </form>
      </div>
    </div>
  );
}

function GoalProgressCard({ metrics }) {
  return (
    <div style={cardStyle()}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Goal Progress</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}><span>Points</span><span>{formatNumber(metrics.totalPoints, 2)} / {formatNumber(POINT_GOAL)}</span></div>
          <ProgressBar value={metrics.pointsPct} color="linear-gradient(90deg,#2563eb,#14b8a6)" track="#dbeafe" />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}><span>Cases</span><span>{formatNumber(metrics.totalCases, 2)} / {CASE_GOAL}</span></div>
          <ProgressBar value={metrics.casesPct} color="linear-gradient(90deg,#0f172a,#2563eb)" track="#d1fae5" />
        </div>
      </div>
    </div>
  );
}

function PaceToGoalCard({ metrics, paceTone, casePaceTone }) {
  return (
    <div style={cardStyle()}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Pace to Goal</div>
      <div style={{ borderRadius: 18, padding: 14, background: "linear-gradient(90deg,#eff6ff,#ecfeff)", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#64748b" }}>Expected by now</div>
        <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4 }}>{formatNumber(metrics.expectedPointsByNow, 2)} points · {formatNumber(metrics.expectedCasesByNow, 2)} cases</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ borderRadius: 18, padding: 14, background: "#ecfdf5", border: "1px solid #d1fae5" }}><div style={{ fontSize: 12, color: "#64748b" }}>Points pace</div><div style={{ fontSize: 24, fontWeight: 800, color: paceTone, marginTop: 4 }}>{metrics.pointsPaceDelta >= 0 ? "+" : ""}{formatNumber(metrics.pointsPaceDelta, 2)}</div></div>
        <div style={{ borderRadius: 18, padding: 14, background: "#eff6ff", border: "1px solid #bfdbfe" }}><div style={{ fontSize: 12, color: "#64748b" }}>Cases pace</div><div style={{ fontSize: 24, fontWeight: 800, color: casePaceTone, marginTop: 4 }}>{metrics.casesPaceDelta >= 0 ? "+" : ""}{formatNumber(metrics.casesPaceDelta, 2)}</div></div>
      </div>
    </div>
  );
}

function MomentumCard({ metrics }) {
  return (
    <div style={cardStyle()}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Momentum</div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}><span>Next milestone</span><span>{formatNumber(metrics.nextMilestone)} pts</span></div>
        <ProgressBar value={metrics.milestoneProgress} color="linear-gradient(90deg,#22c55e,#2563eb)" track="#dcfce7" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <div style={{ background: "#f8fafc", borderRadius: 18, padding: 14 }}><div style={{ fontSize: 12, color: "#64748b" }}>Avg points / case</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{formatNumber(metrics.avgPointsPerCase, 2)}</div></div>
        <div style={{ background: "#f8fafc", borderRadius: 18, padding: 14 }}><div style={{ fontSize: 12, color: "#64748b" }}>Avg premium / case</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{formatCurrency(metrics.avgPremiumPerCase)}</div></div>
      </div>
    </div>
  );
}

function RecentProgressCard({ entries, onEdit, onDelete }) {
  return (
    <div style={cardStyle()}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Recent Progress</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>Edit or delete any entry</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entries.slice(0, 8).map((entry) => (
          <div key={entry.id} style={{ borderRadius: 18, padding: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div><div style={{ fontWeight: 700 }}>{entry.client || "Untitled entry"}</div><div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{entry.date}</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800 }}>{formatNumber(calcPoints(entry.annualPremium), 2)} pts</div><div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{formatCurrency(entry.annualPremium)}</div></div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Cases: {formatNumber(entry.caseCount, 2)}</div>
            {entry.notes ? <div style={{ fontSize: 13, color: "#475569", marginTop: 10 }}>{entry.notes}</div> : null}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <SmallButton background="#dbeafe" onClick={() => onEdit(entry)}>Edit</SmallButton>
              <SmallButton background="#fee2e2" onClick={() => onDelete(entry.id)}>Delete</SmallButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [chartTab, setChartTab] = useState("monthly");
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    client: "",
    annualPremium: "",
    caseCount: "1",
    notes: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function loadEntries() {
      if (!firebaseUser) {
        setEntries([]);
        return;
      }
      setEntriesLoading(true);
      setEntriesError("");
      try {
        const q = query(collection(db, ENTRIES_COLLECTION), where("userId", "==", firebaseUser.uid), orderBy("date", "desc"));
        const snapshot = await getDocs(q);
        const loaded = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setEntries(loaded);
      } catch (err) {
        setEntriesError(err.message || "Failed to load entries.");
      } finally {
        setEntriesLoading(false);
      }
    }
    if (authChecked) loadEntries();
  }, [firebaseUser, authChecked]);

  const metrics = useMemo(() => {
    const totalPremium = entries.reduce((sum, entry) => sum + Number(entry.annualPremium || 0), 0);
    const totalPoints = entries.reduce((sum, entry) => sum + calcPoints(entry.annualPremium), 0);
    const totalCases = entries.reduce((sum, entry) => sum + Number(entry.caseCount || 0), 0);

    const pointsPct = Math.min(100, (totalPoints / POINT_GOAL) * 100);
    const casesPct = Math.min(100, (totalCases / CASE_GOAL) * 100);

    const now = new Date();
    const yearStart = new Date("2026-01-01T00:00:00");
    const totalDays = getDaysBetween(yearStart, DEADLINE);
    const elapsedDays = getDaysBetween(yearStart, now);
    const elapsedRatio = totalDays === 0 ? 0 : Math.min(1, elapsedDays / totalDays);

    const expectedPointsByNow = POINT_GOAL * elapsedRatio;
    const expectedCasesByNow = CASE_GOAL * elapsedRatio;
    const pointsPaceDelta = totalPoints - expectedPointsByNow;
    const casesPaceDelta = totalCases - expectedCasesByNow;
    const daysRemaining = getDaysBetween(now, DEADLINE);
    const pointsRemaining = Math.max(0, POINT_GOAL - totalPoints);
    const casesRemaining = Math.max(0, CASE_GOAL - totalCases);
    const premiumNeeded = pointsRemaining * 2;
    const avgPointsPerCase = totalCases > 0 ? totalPoints / totalCases : 0;
    const avgPremiumPerCase = totalCases > 0 ? totalPremium / totalCases : 0;
    const nextMilestone = milestoneLevels.find((level) => totalPoints < level) || POINT_GOAL;
    const milestoneProgress = Math.min(100, (totalPoints / nextMilestone) * 100);

    const monthlyMap = new Map();
    const weeklyMap = new Map();

    entries.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((entry) => {
      const monthKey = getMonthKey(entry.date);
      const weekKey = getWeekKey(entry.date);
      const points = calcPoints(entry.annualPremium);
      const cases = Number(entry.caseCount || 0);

      monthlyMap.set(monthKey, {
        label: monthKey,
        points: (monthlyMap.get(monthKey)?.points || 0) + points,
        cases: (monthlyMap.get(monthKey)?.cases || 0) + cases,
      });

      weeklyMap.set(weekKey, {
        label: weekKey,
        points: (weeklyMap.get(weekKey)?.points || 0) + points,
        cases: (weeklyMap.get(weekKey)?.cases || 0) + cases,
      });
    });

    return {
      totalPremium,
      totalPoints,
      totalCases,
      pointsPct,
      casesPct,
      expectedPointsByNow,
      expectedCasesByNow,
      pointsPaceDelta,
      casesPaceDelta,
      daysRemaining,
      pointsRemaining,
      casesRemaining,
      premiumNeeded,
      avgPointsPerCase,
      avgPremiumPerCase,
      nextMilestone,
      milestoneProgress,
      monthlyData: Array.from(monthlyMap.values()),
      weeklyData: Array.from(weeklyMap.values()),
    };
  }, [entries]);

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().slice(0, 10),
      client: "",
      annualPremium: "",
      caseCount: "1",
      notes: "",
    });
    setEditingId(null);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      await enableAuthPersistence();
      if (authMode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
          displayName: name,
        });
      }
    } catch (err) {
      setAuthError(err.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const submitEntry = async (e) => {
    e.preventDefault();
    const premium = Number(form.annualPremium);
    const caseCount = Number(form.caseCount);
    if (!firebaseUser || !form.date || Number.isNaN(premium) || premium < 0 || Number.isNaN(caseCount) || caseCount < 0) return;

    try {
      if (editingId !== null) {
        await updateDoc(doc(db, ENTRIES_COLLECTION, editingId), {
          date: form.date,
          client: form.client || "",
          annualPremium: premium,
          caseCount,
          notes: form.notes || "",
          updatedAt: serverTimestamp(),
        });
        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === editingId
              ? { ...entry, date: form.date, client: form.client || "", annualPremium: premium, caseCount, notes: form.notes || "" }
              : entry
          )
        );
      } else {
        const docRef = await addDoc(collection(db, ENTRIES_COLLECTION), {
          userId: firebaseUser.uid,
          date: form.date,
          client: form.client || "",
          annualPremium: premium,
          caseCount,
          notes: form.notes || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setEntries((prev) => [
          {
            id: docRef.id,
            userId: firebaseUser.uid,
            date: form.date,
            client: form.client || "",
            annualPremium: premium,
            caseCount,
            notes: form.notes || "",
          },
          ...prev,
        ]);
      }
      resetForm();
      setCurrentTab("dashboard");
    } catch (err) {
      setEntriesError(err.message || "Failed to save entry.");
    }
  };

  const onEdit = (entry) => {
    setEditingId(entry.id);
    setForm({
      date: entry.date,
      client: entry.client || "",
      annualPremium: String(entry.annualPremium),
      caseCount: String(entry.caseCount),
      notes: entry.notes || "",
    });
    setCurrentTab("entry");
  };

  const onDelete = async (id) => {
    try {
      await deleteDoc(doc(db, ENTRIES_COLLECTION, id));
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setEntriesError(err.message || "Failed to delete entry.");
    }
  };



  if (!authChecked) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>Loading...</div>;
  }

  if (!firebaseUser) {
    return <AuthScreen name={name} setName={setName} email={email} password={password} setEmail={setEmail} setPassword={setPassword} authMode={authMode} setAuthMode={setAuthMode} onSubmit={handleAuthSubmit} authError={authError} authLoading={authLoading} />;
  }

  const paceTone = metrics.pointsPaceDelta >= 0 ? "#059669" : "#e11d48";
  const casePaceTone = metrics.casesPaceDelta >= 0 ? "#059669" : "#e11d48";
  const chartData = chartTab === "monthly" ? metrics.monthlyData : metrics.weeklyData;

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at top left,#dbeafe 0%,#eff6ff 34%,#ecfeff 68%,#f8fafc 100%)", paddingBottom: 96, color: "#0f172a" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: 16 }}>
        <div style={{ borderRadius: 28, padding: 20, color: "white", background: "linear-gradient(135deg,#1d4ed8 0%, #0f766e 100%)", boxShadow: "0 24px 60px rgba(29,78,216,0.22)", marginBottom: 18, border: "1px solid rgba(255,255,255,0.18)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.78)" }}>{getGreeting()}</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>Dashboard</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 10, lineHeight: 1.5 }}>
                Welcome back{firebaseUser.displayName ? `, ${firebaseUser.displayName}` : ""}. Stay consistent. Every case moves you closer.
              </div>
            </div>
            <button onClick={() => signOut(auth)} style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "white", borderRadius: 12, padding: "10px 12px", fontWeight: 700, cursor: "pointer" }}>Sign out</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.82)" }}>{firebaseUser.displayName || firebaseUser.email}</div>
        </div>

        {entriesError ? <div style={{ ...cardStyle({ marginBottom: 16, border: "1px solid #fecaca" }), color: "#b91c1c", fontSize: 13 }}>{entriesError}</div> : null}
        {entriesLoading ? <div style={{ ...cardStyle({ marginBottom: 16 }), fontSize: 14, color: "#475569" }}>Loading your entries...</div> : null}

        {currentTab === "dashboard" && (

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={cardStyle({ padding: 16, background: "linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,255,0.96))" })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>Current focus</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Keep stacking premium consistently</div>
                </div>
                <div style={{ fontSize: 12, color: "#475569", textAlign: "right" }}>
                  <div>{formatNumber(metrics.totalPoints, 2)} pts</div>
                  <div>{formatNumber(metrics.totalCases, 2)} cases</div>
                </div>
              </div>
            </div>
            <GoalProgressCard metrics={metrics} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <StatCard title="Total Points" value={formatNumber(metrics.totalPoints, 2)} subtitle={`${formatCurrency(metrics.totalPremium)} annual premium`} emoji="🎯" gradient="linear-gradient(135deg,#2563eb,#14b8a6)" />
              <StatCard title="Case Count" value={formatNumber(metrics.totalCases, 2)} subtitle={`${formatNumber(metrics.casesRemaining, 2)} left to goal`} emoji="📁" gradient="linear-gradient(135deg,#0f172a,#2563eb)" />
              <StatCard title="Points to Goal" value={formatNumber(metrics.pointsRemaining, 2)} subtitle={`${formatCurrency(metrics.premiumNeeded)} premium needed`} emoji="📈" gradient="linear-gradient(135deg,#14b8a6,#06b6d4)" />
              <StatCard title="Days Remaining" value={formatNumber(metrics.daysRemaining)} subtitle="through Nov 5, 2026" emoji="📅" gradient="linear-gradient(135deg,#3b82f6,#22c55e)" />
            </div>
            <PaceToGoalCard metrics={metrics} paceTone={paceTone} casePaceTone={casePaceTone} />
            <MomentumCard metrics={metrics} />
            <RecentProgressCard entries={entries} onEdit={onEdit} onDelete={onDelete} />
          </div>
        )}

        {currentTab === "entry" && (
          <div style={cardStyle()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{editingId !== null ? "Edit Progress" : "Add New Progress"}</div>
              {editingId !== null ? <button onClick={resetForm} style={{ border: "none", background: "transparent", color: "#2563eb", fontWeight: 700, cursor: "pointer" }}>Cancel</button> : null}
            </div>
            <form onSubmit={submitEntry} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Date"><InputField type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
              <Field label="Case / Client Name"><InputField placeholder="Enter case or client name" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></Field>
              <Field label="Annual Life Premium" hint="Exact values allowed. No rounding required. Points = premium x 0.5."><InputField type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" value={form.annualPremium} onChange={(e) => setForm({ ...form, annualPremium: e.target.value })} required /></Field>
              <Field label="Case Count"><InputField type="number" inputMode="decimal" step="0.01" min="0" placeholder="1" value={form.caseCount} onChange={(e) => setForm({ ...form, caseCount: e.target.value })} required /></Field>
              <div style={{ borderRadius: 18, padding: 14, background: "linear-gradient(90deg,#eff6ff,#ecfeff)" }}><div style={{ fontSize: 12, color: "#64748b" }}>Preview</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{formatNumber(calcPoints(Number(form.annualPremium || 0)), 2)} points</div></div>
              <Field label="Notes"><TextareaField placeholder="Optional notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              <PrimaryButton type="submit">{editingId !== null ? "Save Changes" : "Save Progress"}</PrimaryButton>
            </form>
          </div>
        )}

        {currentTab === "charts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SegmentedTabs value={chartTab} onChange={setChartTab} options={[{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }]} />
            <div style={cardStyle()}><div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{chartTab === "monthly" ? "Monthly Points" : "Weekly Points"}</div><MiniChart data={chartData} dataKey="points" color="#2563eb" /></div>
            <div style={cardStyle()}><div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{chartTab === "monthly" ? "Monthly Cases" : "Weekly Cases"}</div><MiniChart data={chartData} dataKey="cases" color="#14b8a6" /></div>
          </div>
        )}
      </div>
      <MobileNav currentTab={currentTab} setCurrentTab={setCurrentTab} />
    </div>
  );
}
