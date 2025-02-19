document.addEventListener("DOMContentLoaded", function () {
    const agreeCheckbox = document.getElementById("agreeCheckbox");
    const continueBtn = document.getElementById("continueBtn");

    agreeCheckbox.addEventListener("change", function () {
        continueBtn.disabled = !this.checked;
    });

    continueBtn.addEventListener("click", function () {
        alert("Thank you for accepting the Terms of Service. You may proceed.");
        // Redirect or perform any next step action here
    });
});
