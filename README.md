KU (.ku) Programming Language

## Todo List

-- structs --
-------------

struct person {
    age num
    first_name str
    last_name str
    programmer bol
}

:my_person/person = {
    age = 10
    first_name = "Stiliyan"
    last_name = "Kushev"
    programmer = true
}
    
-- sizeof --
------------

:temp/num = 123
@outln @num2str sizeof temp    # prints 4
@outln @num2str sizeof dec     # prints 4

-- throw error --
-----------------

# this will also print the line, col, file, etc..
# and then it will exit with errno 1
throw "My error goes here"

-- document the syntax --
-------------------------

# note: this will probably enforce some overall changes.