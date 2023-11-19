import {AbstractControl} from "../abstractControl";

const VALIDATION_DISABLED = 'Validation is not enabled. Call the "enableValidation()" method first.';

export function validationEnabled(
    target: any,
    name: string,
    descriptor: PropertyDescriptor
) {
    let controlName = [...[target.source]].flat()[0]?.getAttribute('name');

    if (target.isValidationEnabled !== true && descriptor == null) {
        controlName && console.warn(controlName + ': ' + VALIDATION_DISABLED);
        return;
    }

    const method = descriptor.value; // references the method being decorated

    descriptor.value = function (...args) {
        if ((this as AbstractControl).isValidationEnabled !== true) {
            controlName && console.warn(controlName + ': ' + VALIDATION_DISABLED);
            return; // exit the function
        }

        // This part will run when Meteor.isClient == false
        method.apply(this, args);
    };
}
