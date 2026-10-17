import { BookIcon, TagIcon, TagsIcon } from 'lucide-react';
import type { PortalPriceList } from '@eduvault/api-contract';
import { naira } from '@eduvault/shared';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@eduvault/ui';
import { priceListNote, priceText, sizesText } from './purchase-text';

function Tile({
  icon,
  name,
  detail,
  price,
  inStock,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  price: string;
  inStock: boolean;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
        <span className="font-medium tabular-nums">{price}</span>
      </div>
      {inStock ? null : <Badge variant="outline">Out of stock</Badge>}
    </li>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="grid gap-3 sm:grid-cols-2">{children}</ul>
    </section>
  );
}

export function PriceListCard({ list }: { list: PortalPriceList }) {
  const empty = list.books.length === 0 && list.uniforms.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TagsIcon aria-hidden="true" className="size-4" />
          Store price list
        </CardTitle>
        <CardDescription>{priceListNote(list.paymentMethods)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list.books.length === 0 ? null : (
          <Group title={`Books for ${list.levelName ?? 'your level'}`}>
            {list.books.map((book) => (
              <Tile
                key={book.name}
                icon={<BookIcon aria-hidden="true" className="size-4" />}
                name={book.name}
                detail={list.levelName ?? ''}
                price={naira(book.priceMinor)}
                inStock={book.inStock}
              />
            ))}
          </Group>
        )}
        {list.uniforms.length === 0 ? null : (
          <Group title="Uniforms">
            {list.uniforms.map((uniform) => (
              <Tile
                key={uniform.name}
                icon={<TagIcon aria-hidden="true" className="size-4" />}
                name={uniform.name}
                detail={sizesText(uniform.sizes)}
                price={priceText(uniform.minPriceMinor, uniform.maxPriceMinor)}
                inStock={uniform.inStock}
              />
            ))}
          </Group>
        )}
        {empty ? (
          <p className="text-sm text-muted-foreground">No items listed</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
