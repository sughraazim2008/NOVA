import { redirect } from "next/navigation";

// Today is home; its layout sends signed-out visitors to the sign-in screen.
export default function HomePage() {
  redirect("/today");
}
