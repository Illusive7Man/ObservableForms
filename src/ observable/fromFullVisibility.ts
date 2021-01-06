import {Observable} from "rxjs";

/**
 * Creates an Observable that emits information whether the provided target element
 * occupies space in DOM, to its full extent.
 * Besides it being covered by some absolute / fixed element, this can be used as a
 * valid indicator of whether the target is visible or not.
 * @param target Html element whose visibility is inspected.
 */
export function fromFullVisibility(target: HTMLElement): Observable<boolean> {

    return new Observable<boolean>(subscriber => {

        let intersectionObserver = new IntersectionObserver(
            (entries, _) => subscriber.next(entries[0].intersectionRatio > .9), // sometimes it's .99...
            {root: target.parentElement, threshold: [0.5, 1]}
        );

        intersectionObserver.observe(target);

        subscriber.add(_ => intersectionObserver.disconnect());
    });
}
