export {AbstractControl} from './abstractControl';
export {FormControl} from './formControl';
export {FormGroup} from './formGroup';

export {Validators} from './validation/validators';
export * from './common/misc';
export {ConfigService} from './common/config';

import {extendJQueryElements} from './jQueryExtend';
extendJQueryElements();

import {extendVanillaElements} from './vanillaExtend';
extendVanillaElements();

/*===== Types =====*/
export {FormControlType, ValidatorFn, FormControlStatus} from './common/types';

/*===== Miscellaneous =====*/
export {fromFullVisibility} from './common/observables/fromFullVisibility';
export {fromResize} from './common/observables/fromResize';
