import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface GenreTagProps {
  genre: string;
  onClick?: () => void;
  active?: boolean;
  size?: 'sm' | 'md';
}

export default function GenreTag({ genre, onClick, active = false, size = 'sm' }: GenreTagProps) {
  return (
    <Badge
      variant={active ? 'default' : 'secondary'}
      className={cn(
        'cursor-pointer transition-colors',
        size === 'md' && 'px-3 py-1 text-sm',
        onClick && 'hover:bg-primary hover:text-primary-foreground'
      )}
      onClick={onClick}
    >
      {genre}
    </Badge>
  );
}
