import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Rechnung } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate, formatCurrency, displayLookup, lookupKey } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RechnungDialog } from '@/components/dialogs/RechnungDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import {
  AlertCircle,
  Plus,
  Search,
  Receipt,
  CheckCircle2,
  Clock,
  TrendingUp,
  Euro,
  Pencil,
  Trash2,
  FileText,
  Tag,
  Building2,
  CalendarDays,
  Filter,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const CATEGORY_LABELS: Record<string, string> = {
  buero: 'Büromaterial',
  it_software: 'IT & Software',
  reise: 'Reisekosten',
  marketing: 'Marketing',
  miete: 'Miete & Nebenkosten',
  versicherung: 'Versicherungen',
  sonstiges: 'Sonstiges',
};

const CATEGORY_COLORS: Record<string, string> = {
  buero: '#6366f1',
  it_software: '#8b5cf6',
  reise: '#06b6d4',
  marketing: '#f59e0b',
  miete: '#10b981',
  versicherung: '#3b82f6',
  sonstiges: '#94a3b8',
};

export default function DashboardOverview() {
  const { rechnung, loading, error, fetchAll } = useDashboardData();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'alle' | 'offen' | 'bezahlt'>('alle');
  const [filterKategorie, setFilterKategorie] = useState<string>('alle');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Rechnung | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rechnung | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalBetrag = useMemo(() => rechnung.reduce((s, r) => s + (r.fields.betrag ?? 0), 0), [rechnung]);
  const offenCount = useMemo(() => rechnung.filter(r => !r.fields.bezahlt).length, [rechnung]);
  const offenBetrag = useMemo(() => rechnung.filter(r => !r.fields.bezahlt).reduce((s, r) => s + (r.fields.betrag ?? 0), 0), [rechnung]);
  const bezahltCount = useMemo(() => rechnung.filter(r => r.fields.bezahlt).length, [rechnung]);

  const kategorieChartData = useMemo(() => {
    const map: Record<string, number> = {};
    rechnung.forEach(r => {
      const k = lookupKey(r.fields.kategorie) ?? 'sonstiges';
      map[k] = (map[k] ?? 0) + (r.fields.betrag ?? 0);
    });
    return Object.entries(map)
      .map(([key, value]) => ({ key, label: CATEGORY_LABELS[key] ?? key, value }))
      .sort((a, b) => b.value - a.value);
  }, [rechnung]);

  const kategorieOptions = useMemo(() => {
    const keys = [...new Set(rechnung.map(r => lookupKey(r.fields.kategorie)).filter(Boolean))] as string[];
    return keys;
  }, [rechnung]);

  const filtered = useMemo(() => {
    return rechnung.filter(r => {
      if (filterStatus === 'offen' && r.fields.bezahlt) return false;
      if (filterStatus === 'bezahlt' && !r.fields.bezahlt) return false;
      if (filterKategorie !== 'alle') {
        const k = lookupKey(r.fields.kategorie);
        if (k !== filterKategorie) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const num = r.fields.rechnungsnummer?.toLowerCase() ?? '';
        const lief = r.fields.lieferant?.toLowerCase() ?? '';
        if (!num.includes(q) && !lief.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const da = a.fields.rechnungsdatum ?? '';
      const db = b.fields.rechnungsdatum ?? '';
      return db.localeCompare(da);
    });
  }, [rechnung, filterStatus, filterKategorie, search]);

  const handleCreate = useCallback(async (fields: Rechnung['fields']) => {
    await LivingAppsService.createRechnungEntry(fields);
    fetchAll();
  }, [fetchAll]);

  const handleEdit = useCallback(async (fields: Rechnung['fields']) => {
    if (!editRecord) return;
    await LivingAppsService.updateRechnungEntry(editRecord.record_id, fields);
    fetchAll();
  }, [editRecord, fetchAll]);

  const handleToggleBezahlt = useCallback(async (r: Rechnung) => {
    await LivingAppsService.updateRechnungEntry(r.record_id, { bezahlt: !r.fields.bezahlt });
    fetchAll();
  }, [fetchAll]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await LivingAppsService.deleteRechnungEntry(deleteTarget.record_id);
      fetchAll();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rechnungsübersicht</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{rechnung.length} Rechnung{rechnung.length !== 1 ? 'en' : ''} gesamt</p>
        </div>
        <Button
          onClick={() => { setEditRecord(null); setDialogOpen(true); }}
          className="gap-2 shrink-0"
        >
          <Plus size={16} />
          Neue Rechnung
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Gesamtbetrag"
          value={formatCurrency(totalBetrag).replace('$', '€')}
          description="Alle Rechnungen"
          icon={<Euro size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Offen"
          value={String(offenCount)}
          description={`${formatCurrency(offenBetrag).replace('$', '€')} ausstehend`}
          icon={<Clock size={18} className="text-amber-500" />}
        />
        <StatCard
          title="Bezahlt"
          value={String(bezahltCount)}
          description="Abgeschlossen"
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
        />
        <StatCard
          title="Kategorien"
          value={String(kategorieOptions.length)}
          description="Kostenarten"
          icon={<TrendingUp size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Chart + Filters Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Category Chart */}
        {kategorieChartData.length > 0 && (
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Ausgaben nach Kategorie</h2>
            <p className="text-xs text-muted-foreground mb-4">Betrag in EUR</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={kategorieChartData} barSize={28} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}€`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v.toFixed(2)} €`, 'Betrag']}
                />
                {kategorieChartData.map((entry) => (
                  <Bar key={entry.key} dataKey="value" radius={[4, 4, 0, 0]}>
                    <Cell fill={CATEGORY_COLORS[entry.key] ?? '#6366f1'} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Quick Status Filter Panel */}
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Filter</h2>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
            <div className="flex flex-col gap-1">
              {(['alle', 'offen', 'bezahlt'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                    filterStatus === s
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <span className="capitalize">{s === 'alle' ? 'Alle' : s === 'offen' ? 'Offen' : 'Bezahlt'}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterStatus === s ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {s === 'alle' ? rechnung.length : s === 'offen' ? offenCount : bezahltCount}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter */}
          {kategorieOptions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Kategorie</p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                <button
                  onClick={() => setFilterKategorie('alle')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                    filterKategorie === 'alle'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Filter size={12} />
                  Alle Kategorien
                </button>
                {kategorieOptions.map(k => (
                  <button
                    key={k}
                    onClick={() => setFilterKategorie(k)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      filterKategorie === k
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[k] ?? '#94a3b8' }}
                    />
                    {CATEGORY_LABELS[k] ?? k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invoice List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Search Bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Suche nach Nummer, Lieferant..."
              className="pl-9 h-9 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className="text-sm text-muted-foreground shrink-0">
            {filtered.length} Ergebnis{filtered.length !== 1 ? 'se' : ''}
          </span>
        </div>

        {/* Invoice Rows */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
              <Receipt size={22} className="text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-sm">Keine Rechnungen</p>
              <p className="text-xs text-muted-foreground mt-1">
                {search || filterStatus !== 'alle' || filterKategorie !== 'alle'
                  ? 'Keine Treffer für aktuelle Filter'
                  : 'Erstellen Sie Ihre erste Rechnung'}
              </p>
            </div>
            {!search && filterStatus === 'alle' && filterKategorie === 'alle' && (
              <Button size="sm" variant="outline" onClick={() => { setEditRecord(null); setDialogOpen(true); }} className="gap-2">
                <Plus size={14} />
                Rechnung erstellen
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(r => {
              const katKey = lookupKey(r.fields.kategorie);
              const katLabel = katKey ? (CATEGORY_LABELS[katKey] ?? displayLookup(r.fields.kategorie)) : null;
              const katColor = katKey ? (CATEGORY_COLORS[katKey] ?? '#94a3b8') : '#94a3b8';
              return (
                <div
                  key={r.record_id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors group"
                >
                  {/* Status dot */}
                  <div className="shrink-0">
                    <button
                      onClick={() => handleToggleBezahlt(r)}
                      title={r.fields.bezahlt ? 'Als offen markieren' : 'Als bezahlt markieren'}
                      className="transition-transform hover:scale-110"
                    >
                      {r.fields.bezahlt
                        ? <CheckCircle2 size={22} className="text-emerald-500" />
                        : <Clock size={22} className="text-amber-500" />
                      }
                    </button>
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm truncate">
                        {r.fields.rechnungsnummer ?? '—'}
                      </span>
                      {katLabel && (
                        <Badge
                          variant="secondary"
                          className="text-xs px-2 py-0 font-normal gap-1"
                          style={{ borderLeft: `3px solid ${katColor}` }}
                        >
                          <Tag size={10} />
                          {katLabel}
                        </Badge>
                      )}
                      {!r.fields.bezahlt && (
                        <Badge variant="outline" className="text-xs px-2 py-0 text-amber-600 border-amber-300 bg-amber-50">
                          Offen
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {r.fields.lieferant && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 size={11} />
                          {r.fields.lieferant}
                        </span>
                      )}
                      {r.fields.rechnungsdatum && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarDays size={11} />
                          {formatDate(r.fields.rechnungsdatum)}
                        </span>
                      )}
                      {r.fields.rechnungsdatei && (
                        <a
                          href={r.fields.rechnungsdatei}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          <FileText size={11} />
                          Datei
                        </a>
                      )}
                    </div>
                    {r.fields.notizen && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">{r.fields.notizen}</p>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="shrink-0 text-right">
                    <p className={`font-bold text-base tabular-nums ${r.fields.bezahlt ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {r.fields.betrag != null ? `${r.fields.betrag.toFixed(2)} €` : '—'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setEditRecord(r); setDialogOpen(true); }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(r)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <RechnungDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRecord(null); }}
        onSubmit={editRecord ? handleEdit : handleCreate}
        defaultValues={editRecord?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnung']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Rechnung löschen"
        description={`Soll die Rechnung „${deleteTarget?.fields.rechnungsnummer ?? deleteTarget?.record_id}" wirklich gelöscht werden?`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <AlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{error.message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>Erneut versuchen</Button>
    </div>
  );
}
