const COLORS = {
  rpd: "bg-blue-100 text-blue-800",
  gorockford: "bg-green-100 text-green-800",
  eventbrite: "bg-orange-100 text-orange-800",
  rpl: "bg-purple-100 text-purple-800",
  harlem: "bg-red-100 text-red-800",
  "intersoccer-saturday": "bg-yellow-100 text-yellow-800",
  "intersoccer-sunday": "bg-yellow-100 text-yellow-800",
  hononegah: "bg-pink-100 text-pink-800",
  guilford: "bg-teal-100 text-teal-800",
  east: "bg-indigo-100 text-indigo-800",
  auburn: "bg-orange-100 text-orange-800",
  jefferson: "bg-lime-100 text-lime-800",
  "lutheran-hs": "bg-cyan-100 text-cyan-800",
  boylan: "bg-fuchsia-100 text-fuchsia-800",
  rivets: "bg-sky-100 text-sky-800",
  marysplace: "bg-rose-100 text-rose-800",
  rockfordlive: "bg-violet-100 text-violet-800",
  rockbuzz: "bg-amber-100 text-amber-800",
  hardrock: "bg-stone-100 text-stone-800",
  ticketmaster: "bg-emerald-100 text-emerald-800",
  northsuburban: "bg-slate-100 text-slate-800",
  manual: "bg-neutral-200 text-neutral-800",
};

export default function SourceBadge({ source }) {
  return (
    <span className={`inline-block max-w-48 truncate px-2 py-0.5 rounded-full text-xs font-medium ${COLORS[source] || "bg-gray-100 text-gray-800"}`}>
      {source}
    </span>
  );
}
