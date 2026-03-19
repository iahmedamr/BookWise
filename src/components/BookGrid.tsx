import BookCard from '@/components/BookCard';
import { Book } from '@/types/book';

interface BookGridProps {
  books: Book[];
  title?: string;
}

export default function BookGrid({ books, title }: BookGridProps) {
  return (
    <section>
      {title && <h2 className="text-xl font-bold mb-4">{title}</h2>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {books.map((book) => (
          <BookCard key={book.isbn13} book={book} />
        ))}
      </div>
    </section>
  );
}
