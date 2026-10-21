import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Filter, LogIn, LogOut } from "lucide-react";
import API from "@/services/api";
import Loader from "@/components/ui/loader";
import { toast } from "@/services/toast";

type AttendanceRow = {
  id: string;
  type: string;
  date: string;
  name: string;
  email: string;
  role: string;
};

type TodaySummary = {
  date: string;
  totalEvents: number;
  staffPresent: number;
  summary: {
    userId: string;
    name: string;
    role: string;
    lastType?: string;
    lastAt?: string;
    checkIns: number;
    checkOuts: number;
  }[];
  recent: { id: string; type: string; date: string; name: string; role: string }[];
};

const StaffAttendanceReport = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    try {
      const [recordsRes, todayRes] = await Promise.all([
        API.get<AttendanceRow[]>("/attendance/records", { params }),
        API.get<TodaySummary>("/attendance/today"),
      ]);
      setRows(recordsRes.data);
      setToday(todayRes.data);
    } catch (e: any) {
      toast.error("Failed to load attendance", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const presentCount = today?.staffPresent ?? 0;

  const filteredLabel = useMemo(() => {
    if (startDate || endDate) return `${startDate || "…"} to ${endDate || "…"}`;
    return "All dates";
  }, [startDate, endDate]);

  return (
    <div className="p-4 md:p-8 bg-background min-h-screen font-sans space-y-6">
      <div className="bg-primary-700 text-white rounded-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Clock /> Staff Attendance
          </h2>
          <p className="text-white/80 text-sm mt-1">Manual clock-in and clock-out records</p>
        </div>
        <div className="text-right">
          <p className="text-white/80 text-xs">Currently checked in today</p>
          <p className="text-2xl font-bold text-surface">{presentCount}</p>
        </div>
      </div>

      {today && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface rounded-card p-5 border border-sand">
            <p className="text-xs text-muted uppercase">Today&apos;s events</p>
            <p className="text-2xl font-bold text-ink mt-1">{today.totalEvents}</p>
          </div>
          <div className="bg-surface rounded-card p-5 border border-sand">
            <p className="text-xs text-muted uppercase">Staff checked in</p>
            <p className="text-2xl font-bold text-ink mt-1">{today.staffPresent}</p>
          </div>
          <div className="bg-surface rounded-card p-5 border border-sand">
            <p className="text-xs text-muted uppercase">Active staff today</p>
            <p className="text-2xl font-bold text-ink mt-1">{today.summary.length}</p>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-card border border-sand p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-ink" />
          <span className="font-semibold text-ink">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-sand rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-sand rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => { setStartDate(""); setEndDate(""); }}
            className="text-sm text-muted hover:text-ink"
          >
            Clear dates
          </button>
        </div>
        <p className="text-xs text-muted">{filteredLabel} · {rows.length} records</p>
      </div>

      {loading ? (
        <Loader size="sm" title="Loading attendance..." subtitle="Fetching staff records" className="py-8" />
      ) : (
        <div className="bg-surface rounded-card border border-sand overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-muted uppercase text-xs bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4">Staff</th>
                <th className="text-left py-3 px-4">Role</th>
                <th className="text-left py-3 px-4">Event</th>
                <th className="text-left py-3 px-4">Date & time</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted">No attendance records yet</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-sand">
                    <td className="py-3 px-4 font-semibold text-ink">{r.name}</td>
                    <td className="py-3 px-4 capitalize text-muted">{r.role}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.type === "check_in" ? "bg-primary-100 text-ink" : "bg-amber-100 text-amber-800"
                      }`}>
                        {r.type === "check_in" ? <LogIn size={12} /> : <LogOut size={12} />}
                        {r.type === "check_in" ? "Check in" : "Check out"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted whitespace-nowrap">
                      {new Date(r.date).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StaffAttendanceReport;
