import React, { useRef } from 'react';
import { Camera, Trash2, CheckCircle2, Sparkles } from 'lucide-react';

export interface CollateralPhoto {
  id: string;
  url: string;
  label: string;
  timestamp: string;
}

interface PhotoCaptureProps {
  photos: CollateralPhoto[];
  onAddPhoto: (photo: CollateralPhoto) => void;
  onRemovePhoto: (id: string) => void;
  itemCategory: string;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  photos,
  onAddPhoto,
  onRemovePhoto,
  itemCategory
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
        let label = 'Item Verification';
        if (photos.length === 0) label = 'Screen On / Power Tested';
        else if (photos.length === 1) label = 'Back & Housing Condition';
        else if (photos.length === 2) label = 'Serial / IMEI / Rating Plate';
        else label = 'Accessories / Packaging';

        onAddPhoto({
          id: `col-photo-${Date.now()}-${i}`,
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
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e1b4b'; // Deep Indigo
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(`COLLATERAL VERIFICATION: ${itemCategory}`, 25, 130);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#fbbf24'; // Gold
      ctx.fillText('STATUS: POWER ON & UNLOCKED', 25, 170);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`INSPECTED: ${new Date().toLocaleString()}`, 25, 200);
      ctx.fillText('CUSTODIAN: TRUSTEA LUSAKA', 25, 225);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    let label = 'Screen On / Power Tested';
    if (photos.length === 1) label = 'Back & Housing Condition';
    else if (photos.length === 2) label = 'Serial / IMEI / Rating Plate';
    else if (photos.length > 2) label = 'Accessories / Box Checked';

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
          <Camera className="w-3.5 h-3.5 text-red-500" />
          <span>Collateral Inspection Photos</span>
          <span className="text-amber-400 text-[10px] ml-1">({photos.length} captured)</span>
        </span>
        <button
          type="button"
          onClick={handleSimulateCapture}
          className="text-amber-400 hover:text-amber-300 flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-[11px]"
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent flex flex-col justify-end p-2 text-[10px]">
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

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-slate-700 hover:border-red-500 bg-slate-900/60 p-4 flex flex-col items-center justify-center space-y-1.5 text-slate-400 hover:text-red-400 transition aspect-video"
        >
          <Camera className="w-6 h-6 text-slate-500" />
          <span className="text-xs font-bold">Snap / Upload Photo</span>
          <span className="text-[10px] text-slate-500">Front, Back, IMEI</span>
        </button>
      </div>

      {photos.length > 0 && (
        <div className="flex items-center space-x-1.5 text-emerald-400 text-[11px] font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Physical inspection condition photographed</span>
        </div>
      )}
    </div>
  );
};
