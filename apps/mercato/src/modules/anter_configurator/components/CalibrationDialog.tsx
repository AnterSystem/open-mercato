"use client"

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { Vertex } from './types'

export type CalibrationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { pointA: Vertex; pointB: Vertex; realDistanceM: number }) => Promise<void> | void
  submitting?: boolean
}

/**
 * Two-point calibration (spec §3.4, C5). The partner types the two plan-unit
 * points they clicked and the real distance between them — clicking directly
 * on the canvas to pick points is a Phase G-follow-up interaction; this
 * dialog form covers the same contract without depending on a second canvas
 * click-mode.
 */
export function CalibrationDialog({ open, onOpenChange, onSubmit, submitting }: CalibrationDialogProps) {
  const t = useT()
  const [pointAX, setPointAX] = React.useState('0')
  const [pointAY, setPointAY] = React.useState('0')
  const [pointBX, setPointBX] = React.useState('100')
  const [pointBY, setPointBY] = React.useState('0')
  const [realDistanceM, setRealDistanceM] = React.useState('1')

  const handleSubmit = React.useCallback(async () => {
    const pointA: Vertex = [Number(pointAX), Number(pointAY)]
    const pointB: Vertex = [Number(pointBX), Number(pointBY)]
    const distance = Number(realDistanceM)
    if (!Number.isFinite(distance) || distance <= 0) return
    await onSubmit({ pointA, pointB, realDistanceM: distance })
  }, [pointAX, pointAY, pointBX, pointBY, realDistanceM, onSubmit])

  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!submitting) void handleSubmit()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, submitting, handleSubmit])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('anter_configurator.calibration.title', 'Calibrate the plan')}</DialogTitle>
          <DialogDescription>
            {t('anter_configurator.calibration.description', 'Click two points on the plan and type the real distance between them.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Input value={pointAX} onChange={(event) => setPointAX(event.target.value)} placeholder={t('anter_configurator.calibration.pointAX', 'Point A — X')} />
            <Input value={pointAY} onChange={(event) => setPointAY(event.target.value)} placeholder={t('anter_configurator.calibration.pointAY', 'Point A — Y')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={pointBX} onChange={(event) => setPointBX(event.target.value)} placeholder={t('anter_configurator.calibration.pointBX', 'Point B — X')} />
            <Input value={pointBY} onChange={(event) => setPointBY(event.target.value)} placeholder={t('anter_configurator.calibration.pointBY', 'Point B — Y')} />
          </div>
          <Input value={realDistanceM} onChange={(event) => setRealDistanceM(event.target.value)} placeholder={t('anter_configurator.calibration.realDistance', 'Real distance (m)')} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('anter_configurator.calibration.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {t('anter_configurator.calibration.submit', 'Calibrate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CalibrationDialog
