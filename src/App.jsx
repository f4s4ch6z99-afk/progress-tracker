import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA7lsIMc4rD3Se4cth-ldV1IkZpRTYi-Dc",
  authDomain: "production-tracker-5c237.firebaseapp.com",
  projectId: "production-tracker-5c237",
  storageBucket: "production-tracker-5c237.firebasestorage.app",
  messagingSenderId: "880391265940",
  appId: "1:880391265940:web:ae5efee1ec4351a34e9e81",
  measurementId: "G-LFRB2NXYLS",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CASE_GOAL = 40;
const POINT_GOAL = 50000;
const POINTS_PER_1000_PREMIUM = 500;
const PREMIUM_GOAL = (POINT_GOAL / POINTS_PER_1000_PREMIUM) * 1000;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const numberFmt = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function cn() {
  return Array.from(arguments).filter(Boolean).join(" ");
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffDays(a, b) {
  return Math.max(1, Math.ceil((startOfDay(a) - startOfDay(b)) / (1000 * 60 * 60 * 24)));
}

function formatInputDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPointsFromPremium(premium) {
  return (Number(premium) / 1000) * POINTS_PER_1000_PREMIUM;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function getGreetingByTime(date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatHeaderDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDisplayDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCountdown(targetDate, now) {
  const ms = Math.max(0, startOfDay(targetDate) - startOfDay(now));
  const totalDays = Math.ceil(ms / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  return { totalDays, weeks, days };
}

function getLoginEmail(name) {
  const safeName = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40);
  return `${safeName || "user"}@production-tracker.app`;
}

function groupByPeriod(entries, period) {
  const map = new Map();

  entries.forEach((entry) => {
    const date = new Date(entry.date + "T12:00:00");
    const keyDate = new Date(date);

    if (period === "week") {
      const day = keyDate.getDay();
      keyDate.setDate(keyDate.getDate() - day);
    } else {
      keyDate.setDate(1);
    }

    const key = formatInputDate(keyDate);
    const existing = map.get(key) || {
      label:
        period === "week"
          ? `${keyDate.getMonth() + 1}/${keyDate.getDate()}`
          : keyDate.toLocaleString("en-US", { month: "short" }),
      cases: 0,
      premium: 0,
      points: 0,
      fullDate: keyDate,
    };

    existing.cases += Number(entry.cases);
    existing.premium += Number(entry.premium);
    existing.points += getPointsFromPremium(entry.premium);
    map.set(key, existing);
  });

  return Array.from(map.values())
    .sort((a, b) => a.fullDate - b.fullDate)
    .slice(-12)
    .map((item) => ({
      label: item.label,
      cases: item.cases,
      premium: item.premium,
      points: item.points,
    }));
}

function buildDailyProgress(entries, month, year) {
  const filtered = entries
    .filter((entry) => {
      const d = new Date(entry.date + "T12:00:00");
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = new Map();
  let runningPoints = 0;

  filtered.forEach((entry) => {
    const day = new Date(entry.date + "T12:00:00").getDate();
    const current = byDay.get(day) || 0;
    byDay.set(day, current + getPointsFromPremium(entry.premium));
  });

  const result = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = byDay.get(day);
    if (value) runningPoints += value;
    result.push({ label: `${month + 1}/${day}`, points: Number(runningPoints.toFixed(2)) });
  }
  return result;
}

function Card({ className = "", children }) {
  return <div className={cn("rounded-3xl bg-white shadow-lg", className)}>{children}</div>;
}

function Button(props) {
  const variants = {
    solid: "bg-slate-900 text-white",
    ghost: "bg-transparent text-slate-600",
    outline: "border border-slate-200 bg-white text-slate-700",
    violet: "bg-violet-600 text-white",
    cyan: "bg-cyan-600 text-white",
  };
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50",
        variants[props.variant || "solid"],
        props.className
      )}
    >
      {props.children}
    </button>
  );
}

function InputField(props) {
  return (
    <input
      {...props}
      className={cn("h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base outline-none", props.className)}
    />
  );
}

function SelectField(props) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base outline-none"
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-white/20">
      <div className="h-full rounded-full bg-white" style={{ width: `${clampPercent(value)}%` }} />
    </div>
  );
}

function MiniStat({ title, value, subtitle, gradient }) {
  return (
    <Card className={cn("bg-gradient-to-br text-white", gradient)}>
      <div className="p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-white/70">{title}</p>
        <h3 className="mt-2 text-2xl font-bold leading-none">{value}</h3>
        <p className="mt-2 text-sm text-white/80">{subtitle}</p>
      </div>
    </Card>
  );
}

function SimpleBarChart(props) {
  const data = props.data || [];
  const keyName = props.dataKey;
  const max = Math.max(1, ...data.map((d) => Number(d[keyName] || 0)));

  return (
    <div className="space-y-3">
      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No data yet.</div>
      ) : (
        data.map((item, index) => {
          const value = Number(item[keyName] || 0);
          const width = (value / max) * 100;
          return (
            <div key={item.label + index}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-500">{item.label}</span>
                <span className="font-semibold text-slate-800">{props.formatter ? props.formatter(value) : numberFmt.format(value)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className={cn("h-full rounded-full", props.barClassName)} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function SimpleLineChart(props) {
  const data = props.data || [];
  const keyName = props.dataKey;
  if (data.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No data yet.</div>;
  }

  const width = 320;
  const height = 150;
  const paddingX = 18;
  const paddingY = 18;
  const max = Math.max(1, ...data.map((d) => Number(d[keyName] || 0)));

  const points = data
    .map((item, index) => {
      const x = paddingX + (index * (width - paddingX * 2)) / Math.max(1, data.length - 1);
      const y = height - paddingY - (Number(item[keyName] || 0) / max) * (height - paddingY * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `${paddingX},${height - paddingY} ${points} ${width - paddingX},${height - paddingY}`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full rounded-[1.75rem] bg-gradient-to-br from-slate-50 to-white p-2 ring-1 ring-slate-100">
        <polygon points={areaPoints} fill={props.fill || "rgba(139,92,246,0.10)"} />
        <polyline fill="none" stroke={props.stroke || "#06b6d4"} strokeWidth="3.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => {
          const x = paddingX + (index * (width - paddingX * 2)) / Math.max(1, data.length - 1);
          const y = height - paddingY - (Number(item[keyName] || 0) / max) * (height - paddingY * 2);
          return <circle key={item.label + index} cx={x} cy={y} r="4" fill="#fff" stroke={props.stroke || "#06b6d4"} strokeWidth="2.5" />;
        })}
      </svg>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[10px] text-slate-500">
        {data.slice(-4).map((item, index) => (
          <div key={item.label + index} className="truncate text-center">{item.label}</div>
        ))}
      </div>
    </div>
  );
}

function LoginScreen() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAuth() {
    setError("");
    if (!name.trim() || password.length < 6) {
      setError("Enter a name and a password with at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const email = getLoginEmail(name);
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", credential.user.uid, "settings", "main"), {
          name: name.trim(),
          goalDate: formatInputDate(new Date(new Date().getFullYear(), 11, 31)),
          createdAt: new Date().toISOString(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 text-white shadow-xl">
          <div className="p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-white/70">Production Tracker</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm text-white/80">Sign in with your name and password to sync your tracker across devices.</p>
          </div>
        </Card>

        <Card className="mt-4 border border-slate-100 shadow-xl">
          <div className="p-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <button
                onClick={() => setMode("login")}
                className={cn("rounded-xl px-3 py-2 text-sm font-semibold", mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
              >
                Login
              </button>
              <button
                onClick={() => setMode("signup")}
                className={cn("rounded-xl px-3 py-2 text-sm font-semibold", mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
              >
                Create
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Name</label>
                <InputField placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Password</label>
                <InputField type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>

              {error ? <div className="rounded-2xl bg-rose-50 p-3 text-sm font-medium text-rose-600 ring-1 ring-rose-100">{error}</div> : null}

              <Button className="h-12 w-full" onClick={handleAuth} disabled={loading}>
                {loading ? "Working..." : mode === "signup" ? "Create account" : "Login"}
              </Button>

              
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function TrackingApp() {
  const [page, setPage] = useState("dashboard");
  const [entries, setEntries] = useState([]);
  const [goalDate, setGoalDate] = useState(formatInputDate(new Date(new Date().getFullYear(), 11, 31)));
  const [now, setNow] = useState(new Date());
  const [form, setForm] = useState({ id: null, date: formatInputDate(new Date()), premium: "", cases: "" });
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth()));
  const [weeklyMetric, setWeeklyMetric] = useState("points");
  const [monthlyMetric, setMonthlyMetric] = useState("points");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      },
      () => {
        setAuthLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setNow(new Date());
  }, []);

  useEffect(() => {
    if (previewMode) return undefined;
    if (!user) return undefined;

    setDataLoading(true);
    setSettingsLoaded(false);
    const settingsRef = doc(db, "users", user.uid, "settings", "main");
    getDoc(settingsRef)
      .then((snap) => {
        if (snap.exists() && snap.data().goalDate) {
          setGoalDate(snap.data().goalDate);
        } else {
          const defaultGoalDate = formatInputDate(new Date(new Date().getFullYear(), 11, 31));
          setGoalDate(defaultGoalDate);
          setDoc(settingsRef, {
            goalDate: defaultGoalDate,
            createdAt: new Date().toISOString(),
          }, { merge: true });
        }
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));

    const entriesRef = collection(db, "users", user.uid, "entries");
    const unsubscribe = onSnapshot(
      entriesRef,
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        setEntries(data);
        setDataLoading(false);
      },
      () => setDataLoading(false)
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (previewMode) return;
    if (!user || !settingsLoaded) return;

    setDoc(
      doc(db, "users", user.uid, "settings", "main"),
      { goalDate },
      { merge: true }
    ).catch(() => {});
  }, [goalDate, user, previewMode, settingsLoaded]);

  const today = now;
  const greeting = getGreetingByTime(today);
  const headerDate = formatHeaderDate(today);

  const totals = useMemo(() => {
    const totalCases = entries.reduce((sum, entry) => sum + Number(entry.cases), 0);
    const totalPremium = entries.reduce((sum, entry) => sum + Number(entry.premium), 0);
    const totalPoints = getPointsFromPremium(totalPremium);
    return { totalCases, totalPremium, totalPoints };
  }, [entries]);

  const yearStart = new Date(today.getFullYear(), 0, 1);
  const daysElapsed = diffDays(today, yearStart);
  const goalDateObj = new Date(goalDate + "T23:59:59");
  const daysRemainingToGoal = Math.max(0, Math.ceil((goalDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  const totalGoalWindowDays = Math.max(1, Math.ceil((goalDateObj.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)));
  const countdown = formatCountdown(goalDateObj, today);

  const pace = useMemo(() => {
    const caseDailyPace = totals.totalCases / daysElapsed;
    const premiumDailyPace = totals.totalPremium / daysElapsed;
    const pointsDailyPace = totals.totalPoints / daysElapsed;
    return {
      projectedCases: caseDailyPace * totalGoalWindowDays,
      projectedPremium: premiumDailyPace * totalGoalWindowDays,
      projectedPoints: pointsDailyPace * totalGoalWindowDays,
      requiredCasesPerDay: Math.max(0, (CASE_GOAL - totals.totalCases) / Math.max(1, daysRemainingToGoal)),
      requiredPremiumPerDay: Math.max(0, (PREMIUM_GOAL - totals.totalPremium) / Math.max(1, daysRemainingToGoal)),
      requiredPointsPerDay: Math.max(0, (POINT_GOAL - totals.totalPoints) / Math.max(1, daysRemainingToGoal)),
      targetPointsByNow: (POINT_GOAL / totalGoalWindowDays) * daysElapsed,
      targetCasesByNow: (CASE_GOAL / totalGoalWindowDays) * daysElapsed,
    };
  }, [totals, daysElapsed, totalGoalWindowDays, daysRemainingToGoal]);

  const overallAhead = totals.totalPoints >= pace.targetPointsByNow;
  const casesAhead = totals.totalCases >= pace.targetCasesByNow;

  const weeklyPace = useMemo(() => {
    const currentDay = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - currentDay);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const remainingWeeks = Math.max(1, Math.ceil(daysRemainingToGoal / 7));
    const neededCases = Math.max(0, CASE_GOAL - totals.totalCases);
    const neededPremium = Math.max(0, PREMIUM_GOAL - totals.totalPremium);
    const neededPoints = Math.max(0, POINT_GOAL - totals.totalPoints);

    const weeklyCasesTarget = neededCases / remainingWeeks;
    const weeklyPremiumTarget = neededPremium / remainingWeeks;
    const weeklyPointsTarget = neededPoints / remainingWeeks;

    const weekTotals = entries.reduce(
      (acc, entry) => {
        const d = new Date(entry.date + "T12:00:00");
        if (d >= weekStart && d <= weekEnd) {
          acc.cases += Number(entry.cases);
          acc.premium += Number(entry.premium);
          acc.points += getPointsFromPremium(entry.premium);
        }
        return acc;
      },
      { cases: 0, premium: 0, points: 0 }
    );

    const isOnPace = weekTotals.points >= weeklyPointsTarget;
    const daysLeftThisWeek = Math.max(1, 7 - currentDay);

    return {
      targetCases: weeklyCasesTarget,
      targetPremium: weeklyPremiumTarget,
      targetPoints: weeklyPointsTarget,
      weekTotals,
      remainingCases: Math.max(0, weeklyCasesTarget - weekTotals.cases),
      remainingPremium: Math.max(0, weeklyPremiumTarget - weekTotals.premium),
      remainingPoints: Math.max(0, weeklyPointsTarget - weekTotals.points),
      dailyCasesTarget: Math.max(0, (weeklyCasesTarget - weekTotals.cases) / daysLeftThisWeek),
      dailyPremiumTarget: Math.max(0, (weeklyPremiumTarget - weekTotals.premium) / daysLeftThisWeek),
      daysLeftThisWeek,
      isOnPace,
    };
  }, [entries, today, totals, daysRemainingToGoal]);

  const projectedFinishDate = useMemo(() => {
    const dailyPoints = totals.totalPoints / Math.max(1, daysElapsed);
    if (dailyPoints <= 0) return null;
    const remainingPoints = Math.max(0, POINT_GOAL - totals.totalPoints);
    const daysToFinish = Math.ceil(remainingPoints / dailyPoints);
    const finish = new Date(today);
    finish.setDate(finish.getDate() + daysToFinish);
    return finish;
  }, [totals.totalPoints, daysElapsed, today]);

  const years = useMemo(() => {
    const baseYears = new Set([new Date().getFullYear()]);
    entries.forEach((entry) => baseYears.add(new Date(entry.date + "T12:00:00").getFullYear()));
    return Array.from(baseYears).sort((a, b) => b - a);
  }, [entries]);

  const monthOptions = Array.from({ length: 12 }).map((_, idx) => ({
    value: String(idx),
    label: new Date(2024, idx, 1).toLocaleString("en-US", { month: "long" }),
  }));

  const weeklyData = useMemo(() => groupByPeriod(entries, "week"), [entries]);
  const monthlyData = useMemo(() => groupByPeriod(entries, "month"), [entries]);
  const progressData = useMemo(() => buildDailyProgress(entries, Number(selectedMonth), Number(selectedYear)), [entries, selectedMonth, selectedYear]);

  const metricConfig = {
    cases: { label: "Cases", formatter: (value) => numberFmt.format(value), barClass: "bg-violet-500", stroke: "#8b5cf6" },
    premium: { label: "Premium", formatter: (value) => currency.format(value), barClass: "bg-cyan-500", stroke: "#06b6d4" },
    points: { label: "Points", formatter: (value) => numberFmt.format(value), barClass: "bg-emerald-500", stroke: "#22c55e" },
  };

  const statsSummary = useMemo(() => {
    const selectedMonthNumber = Number(selectedMonth);
    const selectedYearNumber = Number(selectedYear);
    const previousMonthDate = new Date(selectedYearNumber, selectedMonthNumber - 1, 1);
    const previousMonthNumber = previousMonthDate.getMonth();
    const previousMonthYear = previousMonthDate.getFullYear();

    function sumForMonth(month, year) {
      return entries.reduce(
        (acc, entry) => {
          const d = new Date(entry.date + "T12:00:00");
          if (d.getMonth() === month && d.getFullYear() === year) {
            acc.cases += Number(entry.cases);
            acc.premium += Number(entry.premium);
            acc.points += getPointsFromPremium(entry.premium);
          }
          return acc;
        },
        { cases: 0, premium: 0, points: 0 }
      );
    }

    const selectedPeriod = sumForMonth(selectedMonthNumber, selectedYearNumber);
    const previousMonth = sumForMonth(previousMonthNumber, previousMonthYear);
    const pointChange = previousMonth.points > 0 ? ((selectedPeriod.points - previousMonth.points) / previousMonth.points) * 100 : 0;
    const premiumChange = previousMonth.premium > 0 ? ((selectedPeriod.premium - previousMonth.premium) / previousMonth.premium) * 100 : 0;
    const caseChange = previousMonth.cases > 0 ? ((selectedPeriod.cases - previousMonth.cases) / previousMonth.cases) * 100 : 0;
    const avgPremiumPerCase = selectedPeriod.cases > 0 ? selectedPeriod.premium / selectedPeriod.cases : 0;
    const avgPointsPerCase = selectedPeriod.cases > 0 ? selectedPeriod.points / selectedPeriod.cases : 0;

    return {
      thisMonth: selectedPeriod,
      selectedPeriod,
      previousMonth,
      pointChange,
      premiumChange,
      caseChange,
      avgPremiumPerCase,
      avgPointsPerCase,
      label: new Date(selectedYearNumber, selectedMonthNumber, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
      previousLabel: previousMonthDate.toLocaleString("en-US", { month: "long", year: "numeric" }),
    };
  }, [entries, selectedMonth, selectedYear]);

  const bestStats = useMemo(() => {
    const dayMap = new Map();
    entries.forEach((entry) => {
      const key = entry.date;
      const existing = dayMap.get(key) || { label: key, cases: 0, premium: 0, points: 0 };
      existing.cases += Number(entry.cases);
      existing.premium += Number(entry.premium);
      existing.points += getPointsFromPremium(entry.premium);
      dayMap.set(key, existing);
    });

    const bestDay = Array.from(dayMap.values()).sort((a, b) => b.points - a.points)[0] || null;
    const bestWeek = weeklyData.slice().sort((a, b) => b.points - a.points)[0] || null;
    const bestMonth = monthlyData.slice().sort((a, b) => b.points - a.points)[0] || null;

    return { bestDay, bestWeek, bestMonth };
  }, [entries, weeklyData, monthlyData]);

  const averages = useMemo(() => {
    const avgPremiumPerCase = totals.totalCases > 0 ? totals.totalPremium / totals.totalCases : 0;
    const avgPointsPerCase = totals.totalCases > 0 ? totals.totalPoints / totals.totalCases : 0;
    const avgPremiumPerWeek = weeklyData.length > 0 ? totals.totalPremium / weeklyData.length : 0;
    const avgCasesPerWeek = weeklyData.length > 0 ? totals.totalCases / weeklyData.length : 0;
    return { avgPremiumPerCase, avgPointsPerCase, avgPremiumPerWeek, avgCasesPerWeek };
  }, [totals, weeklyData]);

  const actualVsTargetData = useMemo(() => {
    const year = today.getFullYear();
    let runningPoints = 0;
    return Array.from({ length: 12 }).map((_, index) => {
      const monthPoints = entries.reduce((sum, entry) => {
        const d = new Date(entry.date + "T12:00:00");
        if (d.getFullYear() === year && d.getMonth() === index) {
          return sum + getPointsFromPremium(entry.premium);
        }
        return sum;
      }, 0);
      runningPoints += monthPoints;
      return {
        label: new Date(year, index, 1).toLocaleString("en-US", { month: "short" }),
        actual: runningPoints,
        target: (POINT_GOAL / 12) * (index + 1),
      };
    });
  }, [entries, today]);

  const monthlyTrendStats = useMemo(() => {
    const values = monthlyData.map((item) => Number(item[monthlyMetric] || 0));
    const total = values.reduce((sum, value) => sum + value, 0);
    const average = values.length > 0 ? total / values.length : 0;
    const best = monthlyData.slice().sort((a, b) => Number(b[monthlyMetric] || 0) - Number(a[monthlyMetric] || 0))[0] || null;
    const first = values.length > 0 ? values[0] : 0;
    const last = values.length > 0 ? values[values.length - 1] : 0;
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return { total, average, best, change };
  }, [monthlyData, monthlyMetric]);

  const progressPercent = clampPercent((totals.totalPoints / POINT_GOAL) * 100);
  const casesPercent = clampPercent((totals.totalCases / CASE_GOAL) * 100);
  const premiumPercent = clampPercent((totals.totalPremium / PREMIUM_GOAL) * 100);

  async function onSaveEntry() {
    setSaveError("");

    const premium = Number(form.premium);
    const cases = Number(form.cases);

    if (!form.date || Number.isNaN(premium) || Number.isNaN(cases)) {
      setSaveError("Please enter a date, premium, and case amount.");
      return;
    }

    try {
      const entry = {
        date: form.date,
        premium,
        cases,
        updatedAt: new Date().toISOString(),
      };

      if (previewMode) {
        if (form.id) {
          setEntries((current) => current.map((item) => (item.id === form.id ? { ...item, ...entry } : item)));
        } else {
          setEntries((current) => [{ id: `demo-${Date.now()}`, ...entry, createdAt: new Date().toISOString() }, ...current]);
        }
      } else {
        if (!user) return;
        if (form.id) {
          await updateDoc(doc(db, "users", user.uid, "entries", form.id), entry);
        } else {
          await addDoc(collection(db, "users", user.uid, "entries"), {
            ...entry,
            createdAt: new Date().toISOString(),
          });
        }
      }

      setForm({ id: null, date: formatInputDate(new Date()), premium: "", cases: "" });
      setPage("dashboard");
    } catch (err) {
      setSaveError(err.message || "Could not save entry. Check Firebase permissions.");
    }
  }

  function onEdit(entry) {
    setForm({ id: entry.id, date: entry.date, premium: String(entry.premium), cases: String(entry.cases) });
    setPage("entry");
  }

  async function onDelete(id) {
    if (previewMode) {
      setEntries((current) => current.filter((entry) => entry.id !== id));
    } else {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "entries", id));
    }
    if (form.id === id) {
      setForm({ id: null, date: formatInputDate(new Date()), premium: "", cases: "" });
    }
  }

  async function handleLogout() {
    if (previewMode) {
      setPreviewMode(false);
      setEntries([]);
      setPage("dashboard");
      return;
    }
    await signOut(auth);
    setEntries([]);
    setSettingsLoaded(false);
    setPage("dashboard");
  }

  const sortedEntries = entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500">Loading...</div>;
  }

  if (!user && !previewMode) {
    return (
      <div>
        <LoginScreen />
        <div className="fixed bottom-4 left-4 right-4 mx-auto max-w-md">
          <Button
            variant="outline"
            className="w-full bg-white shadow-lg"
            onClick={() => {
              const demoEntries = [
                { id: "demo-1", date: formatInputDate(new Date()), premium: 5000, cases: 2 },
                { id: "demo-2", date: formatInputDate(new Date(Date.now() - 86400000)), premium: 4200, cases: 2 },
                { id: "demo-3", date: formatInputDate(new Date(Date.now() - 2 * 86400000)), premium: 6100, cases: 3 },
                { id: "demo-4", date: formatInputDate(new Date(Date.now() - 3 * 86400000)), premium: 3800, cases: 2 },
              ];
              setEntries(demoEntries);
              setPreviewMode(true);
              setAuthLoading(false);
            }}
          >
            Preview without login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
        <div className="sticky top-0 z-20 bg-slate-50/95 px-4 pb-4 pt-6 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-bold tracking-tight text-slate-900">{greeting}</p>
              <p className="mt-2 text-base font-medium text-slate-500">{headerDate}</p>
            </div>
            <button onClick={handleLogout} className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
              Logout
            </button>
          </div>
        </div>

        <main className="flex-1 px-4 py-4">
          {dataLoading ? (
            <div className="rounded-3xl bg-white p-5 text-center text-sm font-medium text-slate-500 shadow-lg">Loading your tracker...</div>
          ) : null}

          {page === "dashboard" ? (
            <div className="space-y-4">
              <Card className="overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 text-white shadow-xl">
                <div className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-white/80">Overall progress</p>
                      <div className="mt-2 text-4xl font-bold">{progressPercent.toFixed(1)}%</div>
                      <p className="mt-2 text-sm text-white/80">{numberFmt.format(totals.totalPoints)} / {numberFmt.format(POINT_GOAL)} points</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 px-3 py-2 text-right backdrop-blur">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/70">Goal date</p>
                      <p className="mt-1 text-lg font-semibold">{goalDate}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <ProgressBar value={progressPercent} />
                  </div>
                </div>
              </Card>

              <Card className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-xl">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/80">Focus this week</p>
                    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", weeklyPace.isOnPace ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                      {weeklyPace.isOnPace ? "Ahead" : "Behind"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/15 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/70">Weekly target (cases)</p>
                      <p className="mt-1 text-xl font-bold">{numberFmt.format(weeklyPace.targetCases)}</p>
                      <p className="text-xs text-white/70">Done: {numberFmt.format(weeklyPace.weekTotals.cases)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/15 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/70">Weekly target (premium)</p>
                      <p className="mt-1 text-xl font-bold">{currency.format(weeklyPace.targetPremium)}</p>
                      <p className="text-xs text-white/70">Done: {currency.format(weeklyPace.weekTotals.premium)}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80">Days left this week</span>
                      <span className="font-semibold">{weeklyPace.daysLeftThisWeek}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-white/80">Daily cases target</span>
                      <span className="font-semibold">{numberFmt.format(weeklyPace.dailyCasesTarget)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-white/80">Daily premium target</span>
                      <span className="font-semibold">{currency.format(weeklyPace.dailyPremiumTarget)}</span>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <MiniStat title="Cases" value={numberFmt.format(totals.totalCases)} subtitle={`${casesPercent.toFixed(1)}% of 40 goal`} gradient="from-slate-900 to-slate-700" />
                <MiniStat title="Annual Premium" value={currency.format(totals.totalPremium)} subtitle={`${premiumPercent.toFixed(1)}% of ${currency.format(PREMIUM_GOAL)}`} gradient="from-cyan-600 to-sky-500" />
              </div>

              <MiniStat title="Points" value={numberFmt.format(totals.totalPoints)} subtitle="Every $1,000 = 500 points" gradient="from-violet-600 to-fuchsia-500" />

              <Card className="overflow-hidden bg-gradient-to-br from-slate-900 via-violet-900 to-fuchsia-700 text-white shadow-xl">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-white/70">Countdown to goal</p>
                      <h3 className="mt-2 text-3xl font-bold leading-none">{countdown.totalDays}</h3>
                      <p className="mt-2 text-sm text-white/80">days remaining until {goalDate}</p>
                    </div>
                    <div className="rounded-2xl bg-white/15 px-3 py-2 text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/70">Breakdown</p>
                      <p className="mt-1 text-lg font-semibold">{countdown.weeks}w {countdown.days}d</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white/10 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/70">Projected finish date</p>
                    <p className="mt-1 text-lg font-semibold">{projectedFinishDate ? formatDisplayDate(projectedFinishDate) : "Add entries to calculate"}</p>
                  </div>
                </div>
              </Card>

              <Card className="border border-slate-200 bg-gradient-to-br from-violet-50 via-indigo-50 to-cyan-50 shadow-xl">
                <div className="p-5">
                  <div className="text-2xl font-bold tracking-tight text-slate-900">Pace to Goal</div>

                  <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4">
                    <p className="text-sm font-medium text-slate-500">Expected by now</p>
                    <p className="mt-2 text-xl font-bold text-slate-900">
                      {numberFmt.format(pace.targetPointsByNow)} points • {numberFmt.format(pace.targetCasesByNow)} cases
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm font-medium text-slate-500">Points pace</p>
                      <p className={cn("mt-2 text-2xl font-bold", overallAhead ? "text-emerald-500" : "text-rose-400")}>
                        {overallAhead ? "+" : "-"}
                        {numberFmt.format(Math.abs(totals.totalPoints - pace.targetPointsByNow))}
                      </p>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm font-medium text-slate-500">Cases pace</p>
                      <p className={cn("mt-2 text-2xl font-bold", casesAhead ? "text-emerald-500" : "text-rose-400")}>
                        {casesAhead ? "+" : "-"}
                        {numberFmt.format(Math.abs(totals.totalCases - pace.targetCasesByNow))}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}

          {page === "entry" ? (
            <div className="space-y-4">
              <Card>
                <div className="p-4">
                  <div className="text-base font-semibold">Goal settings</div>
                  <div className="mt-4 space-y-2">
                    <label className="text-sm font-medium text-slate-700">Goal date</label>
                    <InputField type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Your dashboard pace and weekly targets adjust to this date.</p>
                </div>
              </Card>

              <Card>
                <div className="p-4">
                  <div className="text-base font-semibold">{form.id ? "Edit entry" : "Add new entry"}</div>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Date</label>
                      <InputField type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Annual premium</label>
                      <InputField
                        type="text"
                        inputMode="decimal"
                        placeholder="Enter dollar amount"
                        value={form.premium}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, "");
                          setForm((f) => ({ ...f, premium: value }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Case amount</label>
                      <InputField
                        type="text"
                        inputMode="decimal"
                        placeholder="Enter cases"
                        value={form.cases}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, "");
                          setForm((f) => ({ ...f, cases: value }));
                        }}
                      />
                    </div>
                    <div className="rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-100">
                      <p className="text-sm text-slate-600">Points preview</p>
                      <p className="mt-1 text-2xl font-bold text-violet-700">{numberFmt.format(getPointsFromPremium(Number(form.premium || 0)))} pts</p>
                    </div>

                    {saveError ? (
                      <div className="rounded-2xl bg-rose-50 p-3 text-sm font-medium text-rose-600 ring-1 ring-rose-100">
                        {saveError}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      <Button className="h-12" onClick={onSaveEntry}>{form.id ? "Update" : "Save entry"}</Button>
                      <Button variant="outline" className="h-12" onClick={() => setForm({ id: null, date: formatInputDate(new Date()), premium: "", cases: "" })}>Clear</Button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="p-4">
                  <div className="text-base font-semibold">Manage entries</div>
                  <div className="mt-4 space-y-3">
                    {sortedEntries.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">Your saved entries will show here.</div>
                    ) : (
                      sortedEntries.map((entry) => (
                        <div key={entry.id} className="rounded-2xl bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{currency.format(entry.premium)}</p>
                              <p className="mt-1 text-xs text-slate-500">{numberFmt.format(entry.cases)} cases • {entry.date}</p>
                              <p className="mt-1 text-xs font-medium text-violet-600">{numberFmt.format(getPointsFromPremium(entry.premium))} points</p>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" className="h-10 w-10 p-0" onClick={() => onEdit(entry)}>✏️</Button>
                              <Button variant="outline" className="h-10 w-10 p-0" onClick={() => onDelete(entry.id)}>🗑️</Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            </div>
          ) : null}

          {page === "stats" ? (
            <div className="space-y-4">
              <Card>
                <div className="p-4">
                  <div className="text-base font-semibold">Performance month</div>
                  <p className="mt-1 text-xs text-slate-500">Choose any month to review previous performance.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Month</label>
                      <SelectField value={selectedMonth} onChange={setSelectedMonth} options={monthOptions} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Year</label>
                      <SelectField value={selectedYear} onChange={setSelectedYear} options={years.map((year) => ({ value: String(year), label: String(year) }))} />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="bg-gradient-to-br from-slate-900 to-slate-700 text-white">
                <div className="p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/70">Selected month</p>
                  <h3 className="mt-2 text-2xl font-bold">{statsSummary.label}</h3>
                  <p className="mt-2 text-sm text-white/75">Compared to {statsSummary.previousLabel}</p>
                </div>
              </Card>
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
                  <div className="p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">Points</p>
                    <p className="mt-2 text-lg font-bold">{numberFmt.format(statsSummary.thisMonth.points)}</p>
                    <p className="text-xs text-white/75">points</p>
                  </div>
                </Card>
                <Card className="bg-gradient-to-br from-cyan-600 to-sky-500 text-white">
                  <div className="p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">Premium</p>
                    <p className="mt-2 text-lg font-bold">{currency.format(statsSummary.thisMonth.premium)}</p>
                    <p className="text-xs text-white/75">selected month</p>
                  </div>
                </Card>
                <Card className={cn("text-white", statsSummary.pointChange >= 0 ? "bg-gradient-to-br from-emerald-500 to-teal-500" : "bg-gradient-to-br from-rose-500 to-orange-500")}>
                  <div className="p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">Change</p>
                    <p className="mt-2 text-lg font-bold">{statsSummary.pointChange >= 0 ? "+" : ""}{statsSummary.pointChange.toFixed(1)}%</p>
                    <p className="text-xs text-white/75">vs prior month</p>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="p-4">
                  <div className="text-base font-semibold">Selected month breakdown</div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100">
                      <p className="text-xs text-violet-600">Cases</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{numberFmt.format(statsSummary.selectedPeriod.cases)}</p>
                      <p className={cn("text-xs font-semibold", statsSummary.caseChange >= 0 ? "text-emerald-600" : "text-rose-500")}>{statsSummary.caseChange >= 0 ? "+" : ""}{statsSummary.caseChange.toFixed(1)}% vs prior</p>
                    </div>
                    <div className="rounded-2xl bg-cyan-50 p-3 ring-1 ring-cyan-100">
                      <p className="text-xs text-cyan-700">Premium</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{currency.format(statsSummary.selectedPeriod.premium)}</p>
                      <p className={cn("text-xs font-semibold", statsSummary.premiumChange >= 0 ? "text-emerald-600" : "text-rose-500")}>{statsSummary.premiumChange >= 0 ? "+" : ""}{statsSummary.premiumChange.toFixed(1)}% vs prior</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                      <p className="text-xs text-emerald-700">Avg premium / case</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{currency.format(statsSummary.avgPremiumPerCase)}</p>
                    </div>
                    <div className="rounded-2xl bg-fuchsia-50 p-3 ring-1 ring-fuchsia-100">
                      <p className="text-xs text-fuchsia-700">Avg points / case</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{numberFmt.format(statsSummary.avgPointsPerCase)}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">Weekly trend</div>
                      <p className="mt-1 text-xs text-slate-500">Switch between cases, premium, and points.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
                    {Object.keys(metricConfig).map((metric) => (
                      <button
                        key={metric}
                        onClick={() => setWeeklyMetric(metric)}
                        className={cn("rounded-xl px-3 py-2 text-xs font-semibold", weeklyMetric === metric ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                      >
                        {metricConfig[metric].label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <SimpleBarChart
                      data={weeklyData}
                      dataKey={weeklyMetric}
                      barClassName={metricConfig[weeklyMetric].barClass}
                      formatter={metricConfig[weeklyMetric].formatter}
                    />
                  </div>
                </div>
              </Card>

              <Card className="border border-slate-100 bg-white shadow-xl">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold tracking-tight text-slate-900">Monthly trend</div>
                      <p className="mt-1 text-xs text-slate-500">Month-to-month performance with quick totals.</p>
                    </div>
                    <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", monthlyTrendStats.change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600")}>
                      {monthlyTrendStats.change >= 0 ? "+" : ""}{monthlyTrendStats.change.toFixed(1)}%
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
                    {Object.keys(metricConfig).map((metric) => (
                      <button
                        key={metric}
                        onClick={() => setMonthlyMetric(metric)}
                        className={cn(
                          "rounded-xl px-3 py-2 text-xs font-semibold transition",
                          monthlyMetric === metric
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500"
                        )}
                      >
                        {metricConfig[metric].label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-600">Total</p>
                      <p className="mt-1 text-base font-bold text-slate-900">{metricConfig[monthlyMetric].formatter(monthlyTrendStats.total)}</p>
                    </div>
                    <div className="rounded-2xl bg-cyan-50 p-3 ring-1 ring-cyan-100">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">Average</p>
                      <p className="mt-1 text-base font-bold text-slate-900">{metricConfig[monthlyMetric].formatter(monthlyTrendStats.average)}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Best</p>
                      <p className="mt-1 text-base font-bold text-slate-900">{monthlyTrendStats.best ? metricConfig[monthlyMetric].formatter(monthlyTrendStats.best[monthlyMetric]) : "—"}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{monthlyTrendStats.best ? monthlyTrendStats.best.label : "No data"}</p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <SimpleLineChart
                      data={monthlyData}
                      dataKey={monthlyMetric}
                      stroke={metricConfig[monthlyMetric].stroke}
                      fill={monthlyMetric === "points" ? "rgba(34,197,94,0.10)" : monthlyMetric === "premium" ? "rgba(6,182,212,0.10)" : "rgba(139,92,246,0.10)"}
                    />
                  </div>
                </div>
              </Card>

              <Card>
                <div className="p-4">
                  <div className="text-base font-semibold">Best performance</div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Best day</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{bestStats.bestDay ? bestStats.bestDay.label : "No data"}</p>
                      <p className="text-xs text-slate-500">{bestStats.bestDay ? `${numberFmt.format(bestStats.bestDay.cases)} cases • ${currency.format(bestStats.bestDay.premium)} • ${numberFmt.format(bestStats.bestDay.points)} pts` : "Add entries to calculate"}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-cyan-50 p-3 ring-1 ring-cyan-100">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Best week</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{bestStats.bestWeek ? bestStats.bestWeek.label : "No data"}</p>
                        <p className="text-xs text-slate-500">{bestStats.bestWeek ? `${numberFmt.format(bestStats.bestWeek.points)} pts` : "—"}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Best month</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{bestStats.bestMonth ? bestStats.bestMonth.label : "No data"}</p>
                        <p className="text-xs text-slate-500">{bestStats.bestMonth ? `${numberFmt.format(bestStats.bestMonth.points)} pts` : "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="p-4">
                  <div className="text-base font-semibold">Averages</div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Premium / case</p>
                      <p className="mt-1 text-lg font-bold">{currency.format(averages.avgPremiumPerCase)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Points / case</p>
                      <p className="mt-1 text-lg font-bold">{numberFmt.format(averages.avgPointsPerCase)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Premium / week</p>
                      <p className="mt-1 text-lg font-bold">{currency.format(averages.avgPremiumPerWeek)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Cases / week</p>
                      <p className="mt-1 text-lg font-bold">{numberFmt.format(averages.avgCasesPerWeek)}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border border-slate-100 bg-white shadow-xl">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold tracking-tight text-slate-900">Actual vs Target</div>
                      <p className="mt-1 text-xs text-slate-500">Cumulative points vs plan</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" />Actual</span>
                      <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />Target</span>
                    </div>
                  </div>

                  {(() => {
                    const last = actualVsTargetData[Math.min(new Date().getMonth(), actualVsTargetData.length - 1)];
                    const delta = last ? last.actual - last.target : 0;
                    return (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Current total</p>
                          <p className="mt-1 text-lg font-bold text-slate-900">{last ? numberFmt.format(last.actual) : "—"}</p>
                        </div>
                        <div className={cn("rounded-2xl p-3 ring-1", delta >= 0 ? "bg-emerald-50 ring-emerald-100" : "bg-rose-50 ring-rose-100") }>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Vs target</p>
                          <p className={cn("mt-1 text-lg font-bold", delta >= 0 ? "text-emerald-600" : "text-rose-500")}>{delta >= 0 ? "+" : ""}{numberFmt.format(delta)}</p>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mt-4 space-y-3">
                    {actualVsTargetData.slice(0, new Date().getMonth() + 1).map((item, idx) => {
                      const actualWidth = Math.min(100, (item.actual / POINT_GOAL) * 100);
                      const targetWidth = Math.min(100, (item.target / POINT_GOAL) * 100);
                      const isCurrent = idx === new Date().getMonth();
                      return (
                        <div key={item.label} className={cn("rounded-2xl p-3", isCurrent ? "bg-slate-50 ring-1 ring-slate-200" : "") }>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className={cn("font-medium", isCurrent ? "text-slate-900" : "text-slate-600")}>{item.label}</span>
                            <span className="text-slate-500">{numberFmt.format(item.actual)} / {numberFmt.format(item.target)}</span>
                          </div>
                          <div className="relative h-3 rounded-full bg-slate-100">
                            <div className="absolute left-0 top-0 h-3 rounded-full bg-cyan-400" style={{ width: `${targetWidth}%` }} />
                            <div className="absolute left-0 top-0 h-3 rounded-full bg-violet-600" style={{ width: `${actualWidth}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </main>

        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto grid max-w-md grid-cols-3 gap-2 px-4 py-3">
            <Button variant={page === "dashboard" ? "solid" : "ghost"} className="h-12" onClick={() => setPage("dashboard")}>Dashboard</Button>
            <Button variant={page === "entry" ? "violet" : "ghost"} className="h-12" onClick={() => setPage("entry")}>Entry</Button>
            <Button variant={page === "stats" ? "cyan" : "ghost"} className="h-12" onClick={() => setPage("stats")}>Stats</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
