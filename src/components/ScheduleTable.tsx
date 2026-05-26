import { schedule } from "../data/siteContent";

export function ScheduleTable() {
  return (
    <div className="surface overflow-hidden rounded-[2rem]">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Weekly aikido class schedule</caption>
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[28%]" />
          <col className="w-[44%]" />
        </colgroup>
        <thead className="bg-vermilion text-paper">
          <tr>
            <th scope="col" className="px-5 py-4 font-bold sm:px-6">
              Day
            </th>
            <th scope="col" className="px-5 py-4 font-bold sm:px-6">
              Time
            </th>
            <th scope="col" className="px-5 py-4 font-bold sm:px-6">
              Session
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/10">
          {schedule.map((item) => (
            <tr key={item.day} className="bg-paper/60">
              <th scope="row" className="px-5 py-4 font-bold text-ink sm:px-6">
                {item.day}
              </th>
              <td className="px-5 py-4 font-semibold text-vermilion sm:px-6">
                {item.time}
              </td>
              <td className="px-5 py-4 text-charcoal/80 sm:px-6">
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-bamboo">
                  First half
                </span>
                Beginners
                <span className="mx-2 text-ink/30">·</span>
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-charcoal/55 mt-1">
                  Second half
                </span>
                All levels / more serious practice
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
