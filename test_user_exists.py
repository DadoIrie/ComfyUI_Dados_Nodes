import requests
from py3pin.Pinterest import Pinterest
import contextlib
import io


@contextlib.contextmanager
def suppress_specific_output():
    temp_stdout = io.StringIO()
    temp_stderr = io.StringIO()
    with contextlib.redirect_stdout(temp_stdout), contextlib.redirect_stderr(temp_stderr):
        yield
    output = temp_stdout.getvalue() + temp_stderr.getvalue()
    filtered_output = '\n'.join([line for line in output.split('\n')
                                 if not (line.startswith("No credentials stored [Errno 21] Is a directory:")
                                         and ".cred_root" in line)])
    print(filtered_output, end='')


def check_user_exists(username):
    cred_root = ".cred_root"  # assuming script is run from project root
    with suppress_specific_output():
        pinterest = Pinterest(username=username, cred_root=cred_root)

        USER_RESOURCE = "https://www.pinterest.com/_ngjs/resource/UserResource/get/"
        options = {
            "isPrefetch": "false",
            "username": username,
            "field_set_key": "profile",
        }
        try:
            url = pinterest.req_builder.buildGet(url=USER_RESOURCE, options=options)
            pinterest.get(url=url)
            return True
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error occurred: {e}")
            if e.response.status_code == 404:
                print("User not found. Please check the username.")
                return False
            return False


if __name__ == "__main__":
    username = input("Enter Pinterest username to check: ")
    exists = check_user_exists(username)
    print(f"User '{username}' exists: {exists}")