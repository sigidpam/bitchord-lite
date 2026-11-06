import { BackButton } from '@/components/BackButton';

/** The page title row (report §1, `.header-nav`). */
export function PageHeader({ title }: { title: string }) {
  return (
    <div className="mx-(--body-gutter) pt-8">
      <BackButton className="-ml-1 mb-1.5" />
      <h1 className="type-header-emphasized">{title}</h1>
    </div>
  );
}
