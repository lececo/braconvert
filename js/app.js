var videoFormat = "audio";
var progressBarCounter = 0;
var gid = null;
var name = null;

function dropDownInfo(format) {
    videoFormat = format;
    $('#button_dropdown').text(format);
}

function changeModal(success) {
    if (success) {
        document.getElementById("download").style.display = "block";
        $("h6#progress_header").html("Titel: " + name + " kann heruntergeladen werden!");
        $("h5#modalTitel").html("Anfrage erfolgreich.");
    } else {
        $("h6#progress_header").html("Fehler, geben Sie eine gültige URL ein");
        $("h5#modalTitel").html("Anfrage nicht erfolgreich");
        document.getElementById("progress_id").style.display = "none";
    }
}

function downloadVideoModal() {
    document.getElementById("download").style.display = "none";
    document.getElementById("progress_id").style.display = "none";
    $("h6#progress_header").html("Vielen Dank für die Nutzung unseres Services. Geben Sie uns gerne ein Feedback.");
    $("h5#modalTitel").html("Video wurde heruntergeladen");
}


function backToNormal() {
    document.getElementById("download").style.display = "none";
    $("h6#progress_header").html("Video ist in Bearbeitung");
    $("h5#modalTitel").html("Ihre Anfrage wird bearbeitet");
    document.getElementById("progress_id").style.display = "block";
    progressBarCounter = 0;
}

function makeProgress() {
    if (progressBarCounter < 80) {
        progressBarCounter += 1;
        $("#pbID").css("width", progressBarCounter + "%").text(progressBarCounter + " %");
        setTimeout(makeProgress, 50);
    }
}

function makeProgressEnd() {
    if (progressBarCounter < 100) {
        progressBarCounter += 1;
        $("#pbID").css("width", progressBarCounter + "%").text(progressBarCounter + " %");
        setTimeout(makeProgressEnd, 50);
    }
}


function handleVideoConvert(url) {

    // Prevent empty names
    if (url.trim().length !== 0 && videoFormat.trim().length !== 0) {
        let data = {
            "url": url,
            "format": videoFormat,
        };

        $.ajax({                // set up ajax request
            url: 'http://localhost:8080/convert',
            type: 'POST',    // POST-request for CREATE
            data: JSON.stringify(data),
            contentType: 'application/json',  // using json in request
            crossDomain: 'true',
            dataType: 'json',
            error: (jqXHR, textstatus, errorthrown) => {
                console.log(jqXHR.responseJSON, jqXHR.status);
                changeModal(false);
            },
            success: (data, textStatus, request) => {

                if (data.message.toString().includes("Success")) {
                    gid = data.id;
                    name = data.filename;

                    makeProgressEnd();
                    changeModal(true);
                }
            },
        });
    }
}

function downloadVideo() {
    downloadVideoModal();

    if ((!gid || !name)) {
        return;
    }

    window.location.href = `http://localhost:8080/download?id=${gid}&name=${name}`;
    name = null;
}

function checkBlock() {
    if (!document.getElementById('ads')) {
        $('#blockModal').modal('show');
        setTimeout(checkBlock, 5000);
    }
}


$(document).ready(function () {
    $('#convertBtn').click(function () {
        const url = $('#videoUrl').val();

        if (!(url == '' || url === '')) {
            $('#convertModal').modal('show');
            backToNormal();
            makeProgress();

            handleVideoConvert(url);
        }

    });

    $('#download').click(function () {
        if (progressBarCounter >= 100 && gid !== null) {
            downloadVideo();
        }
    });

    $('#audio_dropdown').click(function () {
        dropDownInfo("audio");
    });

    $('#video_dropdown').click(function () {
        dropDownInfo("video");
    });

    checkBlock();
});