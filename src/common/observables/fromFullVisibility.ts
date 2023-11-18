import {NEVER, Observable} from "rxjs";

/**
 * Creates an Observable that emits information whether the provided target element
 * occupies space in DOM, to its full extent.
 * Besides it being covered by some absolute / fixed element, this can be used as a
 * valid indicator of whether the target is visible or not.
 * @param target Html element whose visibility is inspected.
 */
export function fromFullVisibility(target: HTMLElement): Observable<boolean> {

    if (target == null)
        return NEVER;

    return new Observable<boolean>(subscriber => {

        // Observing document is like observing the viewport (triggers on scroll)
        // Observing body doesn't handles the display: none (kinda does handle the overflow)
        // Parent element handles display perfectly, but doesn't ha

        let documentIntersectionObserver = new IntersectionObserver(
            (entries, _) => subscriber.next(entries[0].intersectionRatio > .5),
            {root: target.parentElement, threshold: [0.5, 1]}
        );

        documentIntersectionObserver.observe(target);

        subscriber.add(() => documentIntersectionObserver.disconnect());
    });
}
