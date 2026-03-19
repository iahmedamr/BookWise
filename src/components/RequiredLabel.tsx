import { Label } from '@/components/ui/label';

interface RequiredLabelProps {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function RequiredLabel({ htmlFor, required = true, children, className }: RequiredLabelProps) {
  return (
    <Label htmlFor={htmlFor} className={className}>
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
}
