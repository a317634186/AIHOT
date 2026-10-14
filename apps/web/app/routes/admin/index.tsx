import { redirect } from "react-router";

// The admin opens on the statistics: traffic, content and pipeline health at a glance.
export function loader() {
  throw redirect("/admin/stats");
}

export default function AdminIndex() {
  return null;
}
