import { redirect } from "next/navigation";

// Пока стартового экрана нет — сразу ведём на тренировку.
export default function Home() {
  redirect("/train");
}
