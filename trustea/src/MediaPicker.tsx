import { useEffect, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

export default function MediaPicker({
  label,
  file,
  onChange,
  accept = 'image/jpeg,image/png,image/webp',
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const imageFile = Boolean(file?.type.startsWith('image/'));

  useEffect(() => {
    if (!file || !imageFile) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, imageFile]);

  const cameraAccept = accept.split(',').filter((type) => type.trim().startsWith('image/')).join(',');

  return (
    <div className="media-picker">
      <span className="media-picker-label">{label}</span>
      <div className="media-picker-actions">
        <label className="button button-outline media-picker-button">
          <ImagePlus size={15} /> Choose {imageFile ? 'image' : 'file'}
          <input
            type="file"
            accept={accept}
            onChange={(event) => onChange(event.currentTarget.files?.[0] || null)}
          />
        </label>
        {cameraAccept && (
          <label className="button button-outline media-picker-button">
            <Camera size={15} /> Take photo
            <input
              type="file"
              accept={cameraAccept}
              capture="environment"
              onChange={(event) => onChange(event.currentTarget.files?.[0] || null)}
            />
          </label>
        )}
      </div>
      {file && (
        <div className="media-picker-selection">
          {previewUrl && <img src={previewUrl} alt="Selected image preview" />}
          <span>{file.name}</span>
          <button type="button" onClick={() => onChange(null)} aria-label="Remove selected file"><X size={15} /></button>
        </div>
      )}
      <small>JPG, PNG or WebP · max 10 MB{accept.includes('application/pdf') ? ' · PDF also accepted' : ''}</small>
    </div>
  );
}
