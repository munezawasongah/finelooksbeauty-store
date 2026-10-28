/** Job processors shared by the worker service and inline (no-Redis) mode. */
import type { JobMap, JobName } from "./queue";
import { processEvent } from "./events";
import { importItems, pushPending, reconcile, refreshFromOrder, refreshItems } from "./clover/sync";
import { sendEmail } from "./email";

export async function runJob<N extends JobName>(name: N, data: JobMap[N]): Promise<void> {
  switch (name) {
    case "events:process":
      await processEvent((data as JobMap["events:process"]).eventId);
      return;
    case "clover:push":
      await pushPending();
      return;
    case "clover:refresh-items": {
      const d = data as JobMap["clover:refresh-items"];
      await refreshItems(d.merchantId, d.itemIds, d.reason);
      return;
    }
    case "clover:refresh-order": {
      const d = data as JobMap["clover:refresh-order"];
      await refreshFromOrder(d.merchantId, d.orderId);
      return;
    }
    case "clover:reconcile":
      await reconcile((data as JobMap["clover:reconcile"]).triggeredBy);
      return;
    case "clover:import":
      await importItems((data as JobMap["clover:import"]).triggeredBy);
      return;
    case "email:send":
      await sendEmail(data as JobMap["email:send"]);
      return;
  }
}
