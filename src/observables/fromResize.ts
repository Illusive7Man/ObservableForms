import {NEVER, Observable} from "rxjs";
import {debounceTime, tap} from "rxjs/operators";

/**
 * Creates an Observable that emits resize events of the provided target.
 * @param target Html element on which resize event is observed.
 */
export function fromResize(target: HTMLElement): Observable<void> {

    if (target == null)
        return NEVER;

    let isFresh = true, isTransition = false;

    return new Observable<void>(subscriber => {

        let sourceObservable =
        new Observable<void>(resizeObserverSubscriber => {

            let resizeObserver = new ResizeObserver(_ => resizeObserverSubscriber.next(null));

            resizeObserver.observe(target);                                                         // Observe reference's resize
            resizeObserverSubscriber.add(_ => resizeObserver.disconnect());

        }).pipe(
            tap(_ => isFresh ? (isFresh = false) || subscriber.next() : isTransition = true), // Do the first one
            debounceTime(34),                                                              // If triggered more than once, debounce 34ms (some fps calculation...)
            tap(_ => isTransition && subscriber.next())                                       // and do it one final time at the end of transition
        ).subscribe(_ => (isFresh = true) && (isTransition = false));


        subscriber.add(sourceObservable);
    })


}
