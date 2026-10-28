import { ProductView, productMetadata } from "@/components/store/ProductView";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/shop/[product]">) {
  const { product } = await params;
  return productMetadata(product);
}

export default async function UncategorizedProductPage({ params }: PageProps<"/shop/[product]">) {
  const { product } = await params;
  return <ProductView slug={product} urlCategory={null} />;
}
