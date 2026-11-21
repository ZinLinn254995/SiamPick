import { useEffect, useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { isSafeHttpUrl } from '../utils/format';

interface ProductImageProps {
  src: string;
  fallbackSrc?: string | null;
  alt: string;
  title: string;
  unavailableLabel?: string;
  className?: string;
}

function deriveDirectFallbackUrl(
  src: string,
  explicitFallback?: string | null
): string | null {
  if (explicitFallback && explicitFallback !== src && isSafeHttpUrl(explicitFallback)) {
    return explicitFallback;
  }

  if (src.startsWith('/api/image-proxy?')) {
    try {
      const query = src.slice('/api/image-proxy?'.length);
      const params = new URLSearchParams(query);
      const decoded = params.get('url');
      if (decoded && decoded !== src && isSafeHttpUrl(decoded)) {
        return decoded;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function ProductImage({
  src,
  fallbackSrc,
  alt,
  unavailableLabel = 'Verified image unavailable',
  className = '',
}: ProductImageProps) {
  const directFallback = useMemo(
    () => deriveDirectFallbackUrl(src, fallbackSrc),
    [src, fallbackSrc]
  );

  const [activeSrc, setActiveSrc] = useState(src);
  const [triedFallback, setTriedFallback] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setActiveSrc(src);
    setTriedFallback(false);
    setHasError(false);
  }, [src, directFallback]);

  const handleError = () => {
    if (!triedFallback && directFallback && activeSrc !== directFallback) {
      setTriedFallback(true);
      setActiveSrc(directFallback);
      return;
    }
    setHasError(true);
  };

  if (hasError || !activeSrc) {
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
      src={activeSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={handleError}
      className={`w-full h-full object-cover ${className}`}
    />
  );
}
