# Observable Forms plug-in for jQuery
Inspired by Angular's forms.

Adds observable streams to jQuery objects of forms and form inputs. <br/>
Properties such as **valueChanges, statusChanges, touched, setValidators** etc., are added to the jQuery object, `let $formControl = $('#some-input')`.<br />
List of properties is available in the [type file](src/js/@types/input.d.ts).

Controlling form's behavior and validation in Angular is such a straightforward task that I had to implement some of the workflow in jQuery.<br/>
It is mostly thanks to reactive programming (RxJs), which is made possible by these observable streams.<br/>
_Note that Visual Studio, JetBrains and possible every other code editor will have type support and offer documentation for the added properties._

#### Prerequisites:
- If you have knowledge of RxJs, this plug-in is a must.<br/>
- If you don't, you might want to see if the built-in behavior of the plug-in, i.e. how it handles front-end validation, and what additional API it offers for you to take advantage of. 

## Usage
Note: The extended jQuery object will be called form control / group, depending on if it selects more than a single input element.

``` javascript
let $formControl = $('#some-input')
let $formGroup   = $('#some-input, #some-other-input')
```
The overridden constructor will detect that selected elements are inputs and add the needed properties.
Due to performance issues that might occur when using other jQuery libraries, querying methods such as
find, children, siblings, etc., will not create form controls out of the results automatically, but you can transform them explicitly.<br/>
Evey possible "input" element is supported: input elements (checkbox and radio too), select, textarea and, of course, the form element itself. 

Let's take a look at some real examples to see how useful these streams are.
## Examples
Add examples from **_StackBlitz_**.

## Installing Observable Forms
