import { ProductView, productMetadata } from "@/components/store/ProductView";

/** Blocking route: product lookup happens before streaming so 404s and 301s return real status codes. */
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[category]/[product]">) {
  const { product } = await params;
  return productMetadata(product);
}

export default async function ProductPage({ params }: PageProps<"/[category]/[product]">) {
  const { category, product } = await params;
  return <ProductView slug={product} urlCategory={category} />;
}
