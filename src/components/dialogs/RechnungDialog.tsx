import { useState, useEffect, useRef, useCallback } from 'react';
import type { Rechnung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Camera, Loader2, Upload, FileText, ImagePlus, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { extractFromPhoto, fileToDataUri } from '@/lib/ai';
import { lookupKey } from '@/lib/formatters';

interface RechnungDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: Rechnung['fields']) => Promise<void>;
  defaultValues?: Rechnung['fields'];
  enablePhotoScan?: boolean;
}

export function RechnungDialog({ open, onClose, onSubmit, defaultValues, enablePhotoScan = false }: RechnungDialogProps) {
  const [fields, setFields] = useState<Partial<Rechnung['fields']>>({});
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFields(defaultValues ?? {});
      setPreview(null);
      setScanSuccess(false);
    }
  }, [open, defaultValues]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(fields as Rechnung['fields']);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoScan(file: File) {
    setScanning(true);
    setScanSuccess(false);
    try {
      const uri = await fileToDataUri(file);
      if (file.type.startsWith('image/')) setPreview(uri);
      const schema = `{\n  "rechnungsnummer": string | null, // Rechnungsnummer\n  "rechnungsdatum": string | null, // YYYY-MM-DD // Rechnungsdatum\n  "betrag": number | null, // Betrag (EUR)\n  "lieferant": string | null, // Lieferant/Aussteller\n  "kategorie": "buero" | "it_software" | "reise" | "marketing" | "miete" | "versicherung" | "sonstiges" | null, // Kategorie\n  "rechnungsdatei": string | null, // Rechnung hochladen\n  "bezahlt": boolean | null, // Rechnung bereits bezahlt\n  "notizen": string | null, // Notizen\n}`;
      const raw = await extractFromPhoto<Record<string, unknown>>(uri, schema);
      setFields(prev => {
        const merged = { ...prev } as Record<string, unknown>;
        function matchName(name: string, candidates: string[]): boolean {
          const n = name.toLowerCase().trim();
          return candidates.some(c => c.toLowerCase().includes(n) || n.includes(c.toLowerCase()));
        }
        for (const [k, v] of Object.entries(raw)) {
          if (v != null && (merged[k] == null || merged[k] === '')) merged[k] = v;
        }
        return merged as Partial<Rechnung['fields']>;
      });
      setScanSuccess(true);
      setTimeout(() => setScanSuccess(false), 3000);
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handlePhotoScan(f);
    e.target.value = '';
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      handlePhotoScan(file);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{defaultValues ? 'Edit Rechnung' : 'New Rechnung'}</DialogTitle>
        </DialogHeader>

        {enablePhotoScan && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Recognition
              <span className="text-muted-foreground font-normal">(auto-fills fields)</span>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelect} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !scanning && fileInputRef.current?.click()}
              className={`
                relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                ${scanning
                  ? 'border-primary/40 bg-primary/5'
                  : scanSuccess
                    ? 'border-green-500/40 bg-green-50/50 dark:bg-green-950/20'
                    : dragOver
                      ? 'border-primary bg-primary/10 scale-[1.01]'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              {scanning ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="h-7 w-7 text-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">AI analyzing...</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Fields will be filled automatically</p>
                  </div>
                </div>
              ) : scanSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Fields filled!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Review the values and adjust if needed</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/8 flex items-center justify-center">
                    <ImagePlus className="h-7 w-7 text-primary/70" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Upload photo or document</p>
                  </div>
                </div>
              )}

              {preview && !scanning && (
                <div className="absolute top-2 right-2">
                  <div className="relative group">
                    <img src={preview} alt="" className="h-10 w-10 rounded-md object-cover border shadow-sm" />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPreview(null); }}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-muted-foreground/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="flex-1 h-9 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); cameraInputRef.current?.click(); }}>
                <Camera className="h-3.5 w-3.5 mr-1.5" />Camera
              </Button>
              <Button type="button" variant="outline" size="sm" className="flex-1 h-9 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />Choose photo
              </Button>
              <Button type="button" variant="outline" size="sm" className="flex-1 h-9 text-xs" disabled={scanning}
                onClick={e => {
                  e.stopPropagation();
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'application/pdf,.pdf';
                    fileInputRef.current.click();
                    setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = 'image/*,application/pdf'; }, 100);
                  }
                }}>
                <FileText className="h-3.5 w-3.5 mr-1.5" />Document
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rechnungsnummer">Rechnungsnummer</Label>
            <Input
              id="rechnungsnummer"
              value={fields.rechnungsnummer ?? ''}
              onChange={e => setFields(f => ({ ...f, rechnungsnummer: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rechnungsdatum">Rechnungsdatum</Label>
            <Input
              id="rechnungsdatum"
              type="date"
              value={fields.rechnungsdatum ?? ''}
              onChange={e => setFields(f => ({ ...f, rechnungsdatum: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="betrag">Betrag (EUR)</Label>
            <Input
              id="betrag"
              type="number"
              value={fields.betrag ?? ''}
              onChange={e => setFields(f => ({ ...f, betrag: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lieferant">Lieferant/Aussteller</Label>
            <Input
              id="lieferant"
              value={fields.lieferant ?? ''}
              onChange={e => setFields(f => ({ ...f, lieferant: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kategorie">Kategorie</Label>
            <Select
              value={lookupKey(fields.kategorie) ?? 'none'}
              onValueChange={v => setFields(f => ({ ...f, kategorie: v === 'none' ? undefined : v as 'buero' | 'it_software' | 'reise' | 'marketing' | 'miete' | 'versicherung' | 'sonstiges' }))}
            >
              <SelectTrigger id="kategorie"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="buero">Büromaterial</SelectItem>
                <SelectItem value="it_software">IT & Software</SelectItem>
                <SelectItem value="reise">Reisekosten</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="miete">Miete & Nebenkosten</SelectItem>
                <SelectItem value="versicherung">Versicherungen</SelectItem>
                <SelectItem value="sonstiges">Sonstiges</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rechnungsdatei">Rechnung hochladen</Label>
            <Input
              id="rechnungsdatei"
              value={fields.rechnungsdatei ?? ''}
              onChange={e => setFields(f => ({ ...f, rechnungsdatei: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bezahlt">Rechnung bereits bezahlt</Label>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="bezahlt"
                checked={!!fields.bezahlt}
                onCheckedChange={(v) => setFields(f => ({ ...f, bezahlt: !!v }))}
              />
              <Label htmlFor="bezahlt" className="font-normal">Rechnung bereits bezahlt</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notizen">Notizen</Label>
            <Textarea
              id="notizen"
              value={fields.notizen ?? ''}
              onChange={e => setFields(f => ({ ...f, notizen: e.target.value }))}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : defaultValues ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}