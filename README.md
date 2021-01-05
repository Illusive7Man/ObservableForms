# Observable Forms plug-in for jQuery
Inspired by Angular's forms.
<br/>
<br/>

Adds observable streams to jQuery objects of forms and form inputs. <br/>
Properties such as 
- valueChanges
- statusChanges 
- touched, untouched, dirty, pristine
- setValidators

and many more, are added to the jQuery object: `let $formControl = $('#some-input')`.<br />
List of properties can be found in the [type file](@types/input.d.ts).
<br/><br/>

Controlling form's behavior and validation in Angular is such a straightforward task that I had to implement some of the workflow in jQuery.<br/>
It is mostly thanks to reactive programming (RxJS), which is made possible by these observable streams.<br/>
_Note that Visual Studio, JetBrains, and possibly every other code editor, will have type support and offer documentation for the added properties._

#### Prerequisites:
- If you have knowledge of RxJS, this plug-in is a must.<br/>
- If you don't, you might want to see if the built-in behavior of the plug-in, i.e. how it handles front-end validation, and what additional API it offers for you to take advantage of. 

## Usage
_Note: Form control is the extended jQuery object of a single input element, and form group is the extended object of multiple input elements or a form._

``` javascript
let $formControl = $('#some-input')
let $formGroup   = $('#some-input, #some-other-input') // or $('#some-form')
```
The overridden constructor will detect that selected elements are inputs and add the needed properties.
Due to performance issues that might occur when using other jQuery libraries, querying methods such as
find, children, siblings, etc., will not create form controls out of the results automatically, but you can transform them explicitly.<br/>

##### Supported elements
```html
<form>, <input>, <select>, <textarea>
```
Type checkbox and radio are supported also. 

## Examples
Add examples from **_StackBlitz_**.

## Installing Observable Forms
