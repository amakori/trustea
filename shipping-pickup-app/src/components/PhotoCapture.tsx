import React, { useRef } from 'react';
import { Camera, Trash2, CheckCircle2, Image as ImageIcon, Sparkles } from 'lucide-react';

export interface CapturedPhoto {
  id: string;
  url: string;
  label: string;
  timestamp: string;
}

interface PhotoCaptureProps {
  photos: CapturedPhoto[];
  onAddPhoto: (photo: CapturedPhoto) => void;
  onRemovePhoto: (id: string) => void;
  isFoodDelivery: boolean;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  photos,
  onAddPhoto,
  onRemovePhoto,
  isFoodDelivery
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        const label = isFoodDelivery
          ? photos.length === 0 ? 'Meal Container / Seal' : 'UTH Temperature / Pack Check'
          : photos.length === 0 ? 'Package Front & Label' : 'Security Seal / Box Condition';

        onAddPhoto({
          id: `photo-${Date.now()}-${i}`,
          url,
          label,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Instant simulator for testing on web without camera
  const handleSimulateCapture = () => {
    // Generate clean synthetic sample photo data
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = isFoodDelivery ? '#064e3b' : '#1e293b';
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(isFoodDelivery ? '🍱 UTH GOV MEAL - SEAL INTACT' : '📦 TRUSTEA VERIFIED PARCEL', 30, 140);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`LUSAKA DISPATCH: ${new Date().toLocaleString()}`, 30, 180);
      ctx.fillText(`RIDER: KELVIN MUSONDA #14`, 30, 205);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const label = isFoodDelivery
      ? photos.length === 0 ? 'Meal Thermal Container' : 'UTH Canteen Dispatch Label'
      : photos.length === 0 ? 'Package Label & Barcode' : 'Tamper Seal Photo';

    onAddPhoto({
      id: `photo-sim-${Date.now()}`,
      url: dataUrl,
      label,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-300 flex items-center space-x-1.5">
          <Camera className="w-3.5 h-3.5 text-sky-400" />
          <span>Item Verification Photos</span>
          <span className="text-amber-400 text-[10px] ml-1">({photos.length} captured)</span>
        </span>
        <button
          type="button"
          onClick={handleSimulateCapture}
          className="text-sky-400 hover:text-sky-300 flex items-center space-x-1 px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800 text-[11px]"
        >
          <Sparkles className="w-3 h-3" />
          <span>Quick Capture</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Photo Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {photos.map((p) => (
          <div key={p.id} className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-900 aspect-video">
            <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2 text-[10px]">
              <span className="font-bold text-white truncate">{p.label}</span>
              <span className="text-slate-400 font-mono text-[9px]">{p.timestamp}</span>
            </div>
            <button
              type="button"
              onClick={() => onRemovePhoto(p.id)}
              className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-600/90 hover:bg-red-500 text-white shadow-sm"
              title="Delete photo"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Add photo trigger button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-slate-700 hover:border-sky-500 bg-slate-900/60 p-4 flex flex-col items-center justify-center space-y-1.5 text-slate-400 hover:text-sky-400 transition aspect-video"
        >
          <Camera className="w-6 h-6 text-slate-500" />
          <span className="text-xs font-bold">Snap / Upload Photo</span>
          <span className="text-[10px] text-slate-500">Camera or Gallery</span>
        </button>
      </div>

      {photos.length > 0 && (
        <div className="flex items-center space-x-1.5 text-emerald-400 text-[11px] font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Item condition photographed and verified</span>
        </div>
      )}
    </div>
  );
};
