
/**
 * Used for global configuration.
 */
export class ConfigService {

    /**
     * Observe changes in DOM, adding and removing of nodes,
     * to update lists of controls in initialized groups.
     *
     * Example: adding an input element in a subtree of a form group will add it to the group.
     */
    public static useMutationObservers = true;

    /**
     * List of selectors that will make any new, or removed, html element that matches any of them be skipped over
     * in Mutation observer's scan for changes in controls.
     *
     * This is a performance config and it is not required in 99% of cases.
     */
    public static excludedObserverElements: string[] = ['span.popper.validation'];

}
