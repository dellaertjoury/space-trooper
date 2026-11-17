/** Things that must outlive a scene switch (Cantina <-> run): one input system, one issue tracker. */
import { InputSystem } from '../core/input';
import { Host, IssueTracker } from '../debug/issues';

let input: InputSystem | null = null;
let tracker: IssueTracker | null = null;

export const shared = {
  input(): InputSystem {
    if (!input) input = new InputSystem();
    return input;
  },
  /** The tracker is created once; each scene hands it its own host (pause, screenshot, context). */
  tracker(host: Host): IssueTracker {
    if (!tracker) tracker = new IssueTracker(host);
    else tracker.setHost(host);
    return tracker;
  },
};
