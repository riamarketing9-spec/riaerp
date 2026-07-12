import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Sparkles, Download } from 'lucide-react'

export function AiClientReportDialog({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${periodStart}-${periodEnd}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function generate() {
    setLoading(true)
    setReport('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Нет активной сессии')

      const res = await fetch(
        'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/ai-client-report',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            project_id: projectId,
            period_start: periodStart,
            period_end: periodEnd,
          }),
        }
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Не удалось сгенерировать отчёт')
      setReport(body.report)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Sparkles className="size-3.5" />
            {t('aiReport.title')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('aiReport.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="period_start">{t('aiReport.periodStart')}</Label>
              <Input
                id="period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="period_end">{t('aiReport.periodEnd')}</Label>
              <Input
                id="period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {report && <Textarea rows={8} value={report} readOnly />}
        </div>
        <DialogFooter>
          {report && (
            <Button variant="outline" onClick={downloadReport}>
              <Download className="size-3.5" />
              .txt
            </Button>
          )}
          <Button disabled={!periodStart || !periodEnd || loading} onClick={generate}>
            {loading ? t('aiReport.generating') : t('aiReport.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
