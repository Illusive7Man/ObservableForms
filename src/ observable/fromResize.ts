import {Observable} from "rxjs";

/**
 * Creates an Observable that emits resize events of the provided target.
 * @param target Html element on which resize event is observed.
 */
export function fromResize(target: HTMLElement): Observable<void> {

    return new Observable<void>(subscriber => {

        let resizeObserver = new ResizeObserver(_ => subscriber.next(null));

        resizeObserver.observe(target);

        subscriber.add(_ => resizeObserver.disconnect());
    });
}
