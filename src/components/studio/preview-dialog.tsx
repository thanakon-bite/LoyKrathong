"use client";

import { ArrowLeft, Send } from "lucide-react";
import type { LanternVisual } from "@/types/lantern";
import { LanternPreview } from "@/components/lantern/lantern-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  visual: LanternVisual;
  onClose: () => void;
  onConfirm: () => void;
}

export function PreviewDialog({ open, visual, onClose, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 sm:p-0" hideClose>
        <div className="relative h-[52dvh] min-h-80 w-full overflow-hidden rounded-t-3xl">
          {open && <LanternPreview visual={visual} ignite label="ตัวอย่างโคมของคุณบนผิวน้ำ" />}
        </div>
        <div className="space-y-4 p-5 sm:p-7">
          <DialogHeader>
            <DialogTitle>โคมของคุณพร้อมแล้ว</DialogTitle>
            <DialogDescription>ตรวจสอบข้อความและภาพบนโคมอีกครั้ง เมื่อปล่อยแล้วจะไม่สามารถแก้ไขได้ โคมจะลอยอยู่ 7 วัน</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              <ArrowLeft /> กลับไปแก้ไข
            </Button>
            <Button onClick={onConfirm}>
              <Send /> ยืนยันและปล่อยโคม
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
