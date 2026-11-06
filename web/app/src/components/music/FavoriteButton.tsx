import { StarFilledIcon, StarIcon } from '@/components/icons/Transport';
import type { Track } from '@/data/music/types';
import { useFavorite } from './useFavorite';

interface FavoriteButtonProps {
  track: Track | null;
  className?: string;
  size?: number;
}

/**
 * Apple's Favorite star. It writes to the device library (the source of
 * truth) and, when signed in, mirrors the like to YouTube Music. Visible
 * signed out too, so the native build can build its own library.
 */
export function FavoriteButton({ track, className, size = 18 }: FavoriteButtonProps) {
  const { saved, toggle } = useFavorite(track);
  if (!track) return null;
  return (
    <button
      className={className}
      aria-label={saved ? 'Remove from Favorites' : 'Add to Favorites'}
      aria-pressed={saved}
      title={saved ? 'In Favorites' : 'Add to Favorites'}
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
    >
      {saved ? <StarFilledIcon size={size} /> : <StarIcon size={size} />}
    </button>
  );
}
