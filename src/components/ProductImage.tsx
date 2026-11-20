import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ProductImageProps {
  src: string;
  alt: string;
  title: string;
  unavailableLabel?: string;
  className?: string;
}

export function ProductImage({
  src,
  alt,
  unavailableLabel = 'Verified image unavailable',
  className = '',
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    return (
      <div
        className={`w-full h-full bg-zinc-100/90 flex flex-col items-center justify-center p-6 text-center ${className}`}
        role="img"
        aria-label={unavailableLabel}
      >
        <ImageOff className="w-6 h-6 text-zinc-400 mb-2" aria-hidden="true" />
        <span className="text-xs font-medium text-zinc-500 max-w-[200px]">
          {unavailableLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      className={`w-full h-full object-cover ${className}`}
    />
  );
}
