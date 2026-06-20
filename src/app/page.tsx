import { redirect } from "next/navigation";

// The storefront's home is the shelf. The marketing/home surface lives in the engine.
export default function Home() {
  redirect("/library");
}
