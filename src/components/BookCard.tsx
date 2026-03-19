import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import RatingStars from '@/components/RatingStars';
import GenreTag from '@/components/GenreTag';
import { Book } from '@/types/book';

interface BookCardProps {
  book: Book;
}

export default function BookCard({ book }: BookCardProps) {
  return (
    <Link to={`/book/${book.isbn13}`}>
      <Card className="group h-full overflow-hidden hover:shadow-lg transition-shadow duration-200">
        <div className="aspect-[2/3] overflow-hidden bg-muted relative">
          <img
            src={book.thumbnail || '/placeholder.svg'}
            alt={book.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
          />
        </div>
        <CardContent className="p-3 space-y-1.5">
          <h3 className="font-semibold text-sm leading-tight line-clamp-2 font-sans">{book.title}</h3>
          <p className="text-xs text-muted-foreground line-clamp-1">{book.authors}</p>
          <div className="flex items-center gap-2">
            <RatingStars rating={book.average_rating} />
            <span className="text-xs text-muted-foreground">{book.average_rating.toFixed(1)}</span>
          </div>
          {book.categories && (
            <div className="flex flex-wrap gap-1">
              {book.categories.split(';').slice(0, 2).map((g) => (
                <GenreTag key={g} genre={g.trim()} size="sm" />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
